# HRMS M1b-1 — Custom User Model + Roles & Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Django's default user model with a multi-tenant `identity.User` (org_id, email CITEXT, Argon2id, MFA-aware fields, prefs/consents JSONB) before any other module starts referencing users. Add the Permission catalogue (global), Role bundles (org-scoped), and `UserRole` join — populated for M1b's own permission codes only. Later milestones add their own permission codes when their modules land.

**Architecture:** `identity` is the home module for everything authentication-related (this plan: user, roles, perms; M1b-2: auth endpoints, MFA, sessions; M1b-3: RBAC enforcement; M1b-4: audit). Custom user model is set via `AUTH_USER_MODEL = "identity.User"` from day one so we never need a painful migration later. Users have a thread-local org_id context (set by middleware in M1b-3) and queryset auto-scoping for tenant safety.

**Tech Stack:** Same as M1a + `djangorestframework-simplejwt>=5.3,<6.0` (lands here because the user model changes that simplejwt depends on), `pyotp>=2.9,<3.0` (already in pyproject.toml from M0), `argon2-cffi` (already in pyproject.toml from M0).

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (data model — `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `mfa_devices`, `sessions`), §5 (RBAC).

**Branch:** `m1/identity-rbac` (current). Do NOT switch.

**Database state:** This plan changes `AUTH_USER_MODEL`. **Wipe the postgres volume before applying migrations.** Steps 1.0 below take care of that.

---

## File structure (created in this plan)

```
apps/api/
├── pyproject.toml                                      ← + djangorestframework-simplejwt
├── hrms_api/
│   └── settings/
│       └── base.py                                     ← AUTH_USER_MODEL, REST_FRAMEWORK auth, simplejwt config
└── modules/
    └── identity/
        ├── __init__.py
        ├── apps.py
        ├── models.py                                   ← User, Role, Permission, RolePermission, UserRole, UserManager
        ├── admin.py
        ├── migrations/
        │   ├── __init__.py
        │   └── 0001_initial.py                         (auto-generated)
        ├── management/
        │   ├── __init__.py
        │   └── commands/
        │       ├── __init__.py
        │       ├── seed_permission_catalogue.py        ← idempotent: load permission codes
        │       └── seed_default_roles.py               ← idempotent: load system roles per org
        ├── fixtures/
        │   ├── permissions_m1b.yaml                    ← M1b-only permission codes
        │   └── default_roles.yaml                      ← system role definitions (no org_id; rendered per-org by command)
        └── tests/
            ├── __init__.py
            ├── test_user_model.py
            ├── test_roles_permissions.py
            └── test_seed_commands.py
```

---

## Conventions

- Working directory: `/home/universal/Claude/HR_Management/`. All commands assume that directory.
- Branch: `m1/identity-rbac`. Never switch.
- Per-command commit identity:
  ```
  git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "..."
  ```
- Docker calls: `sg docker -c '...'` because the docker group isn't active in scripted shells.
- TDD: failing test → confirm it fails → minimum implementation → confirm it passes → commit.
- Pre-commit hooks active: `# pragma: allowlist secret` for any line that contains a substring detect-secrets flags as a high-entropy token.

---

## Task 1: Custom User model + AUTH_USER_MODEL switch

**Files:**
- Modify: `apps/api/pyproject.toml`
- Create: `apps/api/modules/identity/__init__.py`
- Create: `apps/api/modules/identity/apps.py`
- Create: `apps/api/modules/identity/models.py` (User + UserManager only, in this task)
- Create: `apps/api/modules/identity/admin.py`
- Create: `apps/api/modules/identity/migrations/__init__.py`
- Create: `apps/api/modules/identity/tests/__init__.py`
- Create: `apps/api/modules/identity/tests/test_user_model.py`
- Modify: `apps/api/hrms_api/settings/base.py` (add `AUTH_USER_MODEL`, register `modules.identity`, simplejwt config)

- [ ] **Step 1: Stop the dev compose stack and wipe the postgres volume**

This plan changes `AUTH_USER_MODEL`. Existing migrations applied against the dev database will refuse to migrate cleanly. Wipe and start fresh:

```
sg docker -c 'docker compose -f deploy/docker-compose.yml down -v' 2>&1 | tail -5
```

The `-v` flag removes the named `postgres-data` volume. `make migrate` later in this plan will recreate the schema from scratch.

- [ ] **Step 2: Add `djangorestframework-simplejwt` dependency**

Edit `apps/api/pyproject.toml`. In `dependencies`, insert (alphabetical-ish):
```toml
  "djangorestframework-simplejwt>=5.3,<6.0",
```

Run:
```
cd apps/api && uv sync && cd ../..
```
Expected: `djangorestframework-simplejwt` and its transitive deps install. `uv.lock` updates.

- [ ] **Step 3: Create the `identity` package skeleton**

```
mkdir -p apps/api/modules/identity/{tests,migrations,management/commands,fixtures}
touch apps/api/modules/identity/__init__.py \
      apps/api/modules/identity/tests/__init__.py \
      apps/api/modules/identity/migrations/__init__.py \
      apps/api/modules/identity/management/__init__.py \
      apps/api/modules/identity/management/commands/__init__.py
```

- [ ] **Step 4: Create `apps/api/modules/identity/apps.py`**

```python
from django.apps import AppConfig


class IdentityConfig(AppConfig):
    name = "modules.identity"
    label = "identity"
    verbose_name = "Identity & RBAC"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 5: Write the failing user-model tests first**

Create `apps/api/modules/identity/tests/test_user_model.py`:

```python
"""Tests for the custom User model + UserManager."""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

User = get_user_model()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_create_user_hashes_password_with_argon2(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(
        email="alice@example.com",
        password="s3cret-p@ss!",  # pragma: allowlist secret
        org_id=org_id,
    )
    assert u.email == "alice@example.com"
    assert u.password.startswith("argon2")
    assert u.check_password("s3cret-p@ss!")  # pragma: allowlist secret


@pytest.mark.django_db
def test_create_user_normalizes_email(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="ALICE@Example.COM", password="x", org_id=org_id)
    assert u.email == "ALICE@example.com"  # domain lowercased; local part preserved


@pytest.mark.django_db
def test_create_user_email_is_required(org_id: uuid.UUID) -> None:
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x", org_id=org_id)


@pytest.mark.django_db
def test_create_user_org_id_is_required() -> None:
    with pytest.raises(ValueError):
        User.objects.create_user(email="bob@example.com", password="x", org_id=None)


@pytest.mark.django_db
def test_email_unique_within_org(org_id: uuid.UUID) -> None:
    User.objects.create_user(email="charlie@example.com", password="x", org_id=org_id)
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="charlie@example.com", password="y", org_id=org_id)


@pytest.mark.django_db
def test_same_email_allowed_in_different_orgs() -> None:
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    User.objects.create_user(email="dana@example.com", password="x", org_id=org_a)
    User.objects.create_user(email="dana@example.com", password="y", org_id=org_b)
    assert User.objects.filter(email="dana@example.com").count() == 2


@pytest.mark.django_db
def test_create_superuser_sets_flags(org_id: uuid.UUID) -> None:
    u = User.objects.create_superuser(email="admin@example.com", password="x", org_id=org_id)
    assert u.is_staff is True
    assert u.is_superuser is True


@pytest.mark.django_db
def test_user_has_default_preferences_and_consents(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="e@example.com", password="x", org_id=org_id)
    assert u.preferences == {"theme": "system", "locale": "en-MY"}
    assert u.consents == []
    assert u.mfa_enabled is False
    assert u.failed_login_count == 0


@pytest.mark.django_db
def test_user_status_choices(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="f@example.com", password="x", org_id=org_id)
    assert u.status == "active"
    u.status = "disabled"
    u.save()
    u.refresh_from_db()
    assert u.status == "disabled"


@pytest.mark.django_db
def test_uses_email_as_username_field(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="g@example.com", password="x", org_id=org_id)
    assert u.USERNAME_FIELD == "email"
    assert u.get_username() == "g@example.com"
```

- [ ] **Step 6: Run failing tests — expect import or model errors**

```
cd apps/api && uv run pytest modules/identity/tests/test_user_model.py -v 2>&1 | tail -10; cd ../..
```
Expected: collection failure because `modules.identity` is not in `INSTALLED_APPS` and the User model doesn't exist.

- [ ] **Step 7: Implement `apps/api/modules/identity/models.py` (User + UserManager only)**

```python
"""Custom User model — multi-tenant aware, MFA-ready."""
from __future__ import annotations

import uuid
from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


def _default_preferences() -> dict[str, Any]:
    return {"theme": "system", "locale": "en-MY"}


def _default_consents() -> list[Any]:
    return []


class UserManager(BaseUserManager):
    """Custom manager: enforces email + org_id, hashes passwords."""

    use_in_migrations = True

    def _create_user(
        self,
        email: str,
        password: str | None,
        org_id: uuid.UUID | None,
        **extra: Any,
    ) -> "User":
        if not email:
            raise ValueError("email is required")
        if org_id is None:
            raise ValueError("org_id is required")
        # Normalize email: lowercase the domain, preserve local part casing.
        local, _, domain = email.partition("@")
        email = f"{local}@{domain.lower()}" if domain else email
        user = self.model(email=email, org_id=org_id, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(
        self,
        email: str,
        password: str | None = None,
        org_id: uuid.UUID | None = None,
        **extra: Any,
    ) -> "User":
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, org_id, **extra)

    def create_superuser(
        self,
        email: str,
        password: str | None = None,
        org_id: uuid.UUID | None = None,
        **extra: Any,
    ) -> "User":
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not extra.get("is_staff"):
            raise ValueError("superuser must have is_staff=True")
        if not extra.get("is_superuser"):
            raise ValueError("superuser must have is_superuser=True")
        return self._create_user(email, password, org_id, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """HRMS user. Email is the username; uniqueness is per-org."""

    STATUS_CHOICES = (
        ("active", "Active"),
        ("disabled", "Disabled"),
        ("locked", "Locked"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    email = models.EmailField(max_length=254)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")
    mfa_enabled = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_count = models.IntegerField(default=0)
    preferences = models.JSONField(default=_default_preferences, blank=True)
    consents = models.JSONField(default=_default_consents, blank=True)

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []  # email + password are positional in create_user

    class Meta:
        db_table = "identity_user"
        constraints = [
            models.UniqueConstraint(
                fields=["org_id", "email"],
                condition=models.Q(deleted_at__isnull=True),
                name="user_unique_email_per_org",
            ),
        ]
        indexes = [
            models.Index(fields=["org_id"]),
            models.Index(fields=["email"]),
        ]

    def __str__(self) -> str:
        return f"{self.email} (org={self.org_id})"

    def soft_delete(self) -> None:
        """Soft delete. Preserves the row for audit/historic queries."""
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active", "updated_at"])
```

- [ ] **Step 8: Wire `AUTH_USER_MODEL` and register the app**

Edit `apps/api/hrms_api/settings/base.py`. Make THREE changes:

(a) In `INSTALLED_APPS`, append `"modules.identity",` after `"modules.organization",`. The block becomes:
```python
    "common",
    "modules.health",
    "modules.organization",
    "modules.identity",
```

(b) Add `AUTH_USER_MODEL` after `INSTALLED_APPS`:
```python
AUTH_USER_MODEL = "identity.User"
```

(c) Add simplejwt + DRF auth class to the existing `REST_FRAMEWORK` dict — add the `DEFAULT_AUTHENTICATION_CLASSES` and `DEFAULT_PERMISSION_CLASSES` keys, and a SIMPLE_JWT block:

```python
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "EXCEPTION_HANDLER": "common.exception_handler.hrms_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "AUTH_HEADER_TYPES": ("Bearer",),
}
```

(d) Add `"rest_framework_simplejwt.token_blacklist",` to `INSTALLED_APPS` (so refresh-token blacklisting tables are created):
```python
    "rest_framework_simplejwt.token_blacklist",
    # Local
    "common",
    ...
```

- [ ] **Step 9: Generate the initial migration for `identity`**

```
cd apps/api && uv run python manage.py makemigrations identity 2>&1 | tail -5; cd ../..
```
Expected: `0001_initial.py` is created in `apps/api/modules/identity/migrations/`. It declares the `identity_user` table.

If the makemigrations command produces an error about `AUTH_USER_MODEL` swap, try:
```
cd apps/api && uv run python manage.py migrate --run-syncdb 2>&1 | tail -10; cd ../..
```
Then `makemigrations identity` again.

- [ ] **Step 10: Run the user-model tests — expect PASS**

```
cd apps/api && uv run pytest modules/identity/tests/test_user_model.py -v 2>&1 | tail -15; cd ../..
```
Expected: 10 tests pass.

If any test fails because of the email-uniqueness constraint not being enforced, double-check the `UniqueConstraint(condition=Q(deleted_at__isnull=True))` — sqlite supports this in modern Django. If the test framework (sqlite in-memory) doesn't honor partial unique constraints, fall back to a regular `unique_together = [("org_id", "email")]` and document the trade-off (re-creating a soft-deleted user requires hard-delete first).

- [ ] **Step 11: Register `User` in admin**

Create `apps/api/modules/identity/admin.py`:

```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "org_id", "status", "mfa_enabled", "is_staff", "last_login_at")
    list_filter = ("status", "mfa_enabled", "is_staff", "is_superuser")
    search_fields = ("email",)
    readonly_fields = ("id", "last_login_at", "last_login_ip", "failed_login_count", "created_at", "updated_at")

    fieldsets = (
        (None, {"fields": ("email", "password", "org_id")}),
        ("Status", {"fields": ("status", "mfa_enabled", "is_active", "is_staff", "is_superuser")}),
        ("Audit", {"fields": ("last_login_at", "last_login_ip", "failed_login_count")}),
        ("Preferences", {"fields": ("preferences", "consents")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Timestamps", {"fields": ("id", "created_at", "updated_at")}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "org_id", "password1", "password2"),
        }),
    )
```

- [ ] **Step 12: Run system checks and migrations clean**

```
cd apps/api && uv run python manage.py check 2>&1 | tail -3 && cd ../..
sg docker -c 'docker compose -f deploy/docker-compose.yml up -d postgres redis' 2>&1 | tail -3
sleep 5
sg docker -c 'docker compose -f deploy/docker-compose.yml run --rm api uv run python manage.py migrate' 2>&1 | tail -10
```
Expected: `manage.py check` clean. Migration applies — should run all auth, identity, organization, django_celery_beat, token_blacklist migrations against fresh postgres.

- [ ] **Step 13: Commit Task 1**

```
git add apps/api/pyproject.toml apps/api/uv.lock \
        apps/api/hrms_api/settings/base.py \
        apps/api/modules/identity/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): custom User model with org-scoped uniqueness, MFA-ready fields"
```

---

## Task 2: Roles + Permissions catalogue + UserRoles

**Files:**
- Modify: `apps/api/modules/identity/models.py` (add Permission, Role, RolePermission, UserRole)
- Create: `apps/api/modules/identity/fixtures/permissions_m1b.yaml`
- Create: `apps/api/modules/identity/fixtures/default_roles.yaml`
- Create: `apps/api/modules/identity/management/commands/seed_permission_catalogue.py`
- Create: `apps/api/modules/identity/management/commands/seed_default_roles.py`
- Create: `apps/api/modules/identity/tests/test_roles_permissions.py`
- Create: `apps/api/modules/identity/tests/test_seed_commands.py`

- [ ] **Step 1: Write failing tests for Role/Permission models**

Create `apps/api/modules/identity/tests/test_roles_permissions.py`:

```python
"""Tests for Permission catalogue, Role bundles, RolePermission, UserRole."""
import uuid

import pytest
from django.db import IntegrityError

from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="u@example.com", password="x", org_id=org_id)


@pytest.mark.django_db
def test_permission_code_unique() -> None:
    Permission.objects.create(code="auth:mfa:manage:self", description="Manage own MFA")
    with pytest.raises(IntegrityError):
        Permission.objects.create(code="auth:mfa:manage:self", description="Duplicate")


@pytest.mark.django_db
def test_role_unique_per_org(org_id: uuid.UUID) -> None:
    Role.objects.create(org_id=org_id, code="org_admin", name="Org Admin", is_system=True)
    with pytest.raises(IntegrityError):
        Role.objects.create(org_id=org_id, code="org_admin", name="Dup", is_system=False)


@pytest.mark.django_db
def test_role_same_code_allowed_across_orgs() -> None:
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    Role.objects.create(org_id=org_a, code="manager", name="Manager", is_system=True)
    Role.objects.create(org_id=org_b, code="manager", name="Manager", is_system=True)
    assert Role.objects.filter(code="manager").count() == 2


@pytest.mark.django_db
def test_role_permissions_link(org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="hr_manager", name="HR Manager", is_system=True)
    p1 = Permission.objects.create(code="user:invite", description="Invite users")
    p2 = Permission.objects.create(code="user:edit", description="Edit users")
    RolePermission.objects.create(role=role, permission=p1)
    RolePermission.objects.create(role=role, permission=p2)
    codes = set(role.permissions.values_list("code", flat=True))
    assert codes == {"user:invite", "user:edit"}


@pytest.mark.django_db
def test_role_permission_link_unique(org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="r", name="r", is_system=True)
    p = Permission.objects.create(code="x:y", description="x")
    RolePermission.objects.create(role=role, permission=p)
    with pytest.raises(IntegrityError):
        RolePermission.objects.create(role=role, permission=p)


@pytest.mark.django_db
def test_user_role_assignment(user: User, org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="employee", name="Employee", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    assert user.roles.count() == 1
    assert user.roles.first() == role


@pytest.mark.django_db
def test_user_can_hold_multiple_roles(user: User, org_id: uuid.UUID) -> None:
    role_mgr = Role.objects.create(org_id=org_id, code="manager", name="Manager", is_system=True)
    role_fin = Role.objects.create(org_id=org_id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=user, role=role_mgr, granted_by=None)
    UserRole.objects.create(user=user, role=role_fin, granted_by=None)
    codes = set(user.roles.values_list("code", flat=True))
    assert codes == {"manager", "finance"}


@pytest.mark.django_db
def test_user_role_granted_by_self_reference(user: User, org_id: uuid.UUID) -> None:
    granter = User.objects.create_user(email="boss@example.com", password="x", org_id=org_id)
    role = Role.objects.create(org_id=org_id, code="employee", name="Employee", is_system=True)
    ur = UserRole.objects.create(user=user, role=role, granted_by=granter)
    assert ur.granted_by == granter
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_roles_permissions.py -v 2>&1 | tail -10; cd ../..
```
Expected: ImportError on `Permission`, `Role`, `RolePermission`, `UserRole`.

- [ ] **Step 3: Append Permission/Role/RolePermission/UserRole to `apps/api/modules/identity/models.py`**

Append to the existing `models.py` (after the `User` class):

```python
class Permission(models.Model):
    """Global permission catalogue. Codes follow `<module>:<resource>:<action>[:<scope>]`."""

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=128, unique=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "identity_permission"
        ordering = ("code",)

    def __str__(self) -> str:
        return self.code


class Role(models.Model):
    """Org-scoped role bundle. `code` is unique within an org."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    description = models.CharField(max_length=255, blank=True)
    is_system = models.BooleanField(default=False)

    permissions = models.ManyToManyField(
        Permission,
        through="RolePermission",
        related_name="roles",
    )

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "identity_role"
        constraints = [
            models.UniqueConstraint(fields=["org_id", "code"], name="role_unique_code_per_org"),
        ]
        indexes = [models.Index(fields=["org_id"])]

    def __str__(self) -> str:
        return f"{self.code}@{self.org_id}"


class RolePermission(models.Model):
    """Through-table for Role.permissions."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="role_links")

    class Meta:
        db_table = "identity_role_permission"
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="role_permission_unique"),
        ]


class UserRole(models.Model):
    """Assigns Roles to Users. `granted_by` is the user that performed the grant (nullable for system seeds)."""

    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="user_roles",
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_links")
    granted_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grants_made",
    )
    granted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "identity_user_role"
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="user_role_unique"),
        ]
        indexes = [models.Index(fields=["user"]), models.Index(fields=["role"])]
```

Also, add a convenience reverse manager on `User`. At the bottom of the User class definition (or via a property), expose `roles` so `user.roles` returns Roles directly (skipping UserRole). Edit the `User` class to add:

```python
    @property
    def roles(self):
        return Role.objects.filter(user_links__user=self)
```

(Keeping `roles` as a property avoids reverse-accessor naming collisions with the M2M through-table.)

- [ ] **Step 4: Generate migration**

```
cd apps/api && uv run python manage.py makemigrations identity 2>&1 | tail -5; cd ../..
```
Expected: `0002_*.py` adds Permission, Role, RolePermission, UserRole tables.

- [ ] **Step 5: Re-run model tests — expect PASS**

```
cd apps/api && uv run pytest modules/identity/tests/test_roles_permissions.py -v 2>&1 | tail -15; cd ../..
```
Expected: 8 tests pass.

- [ ] **Step 6: Create the permission catalogue fixture**

Create `apps/api/modules/identity/fixtures/permissions_m1b.yaml`. List the M1b-scoped permission codes (auth, user, role, permission, department, org settings, audit). Codes for leave/claims/kpi/etc. land in their respective milestones.

```yaml
# Permission codes used in M1b (identity, RBAC, audit, departments, org settings).
# Subsequent milestones APPEND their own codes via additional fixtures.

# auth (self-managed)
- { code: auth:mfa:manage:self, description: Manage own MFA device }

# user
- { code: user:invite,    description: Invite a new user to the org }
- { code: user:edit,      description: Edit user records (admin) }
- { code: user:disable,   description: Disable a user account }
- { code: user:delete,    description: Soft-delete a user }
- { code: user:read:self, description: Read own user record }
- { code: user:read:team, description: Read direct-reports' user records }
- { code: user:read:org,  description: Read any user record in the org }

# role / permission
- { code: role:read,        description: Read roles in the org }
- { code: role:write,       description: Create/edit/delete roles in the org }
- { code: permission:read,  description: Read the global permission catalogue }

# department
- { code: department:read,  description: Read departments in the org }
- { code: department:write, description: Create/edit/delete departments in the org }

# org settings
- { code: org:settings:read,  description: Read organization settings }
- { code: org:settings:write, description: Edit organization settings }

# audit
- { code: audit:read:org,                description: Read the audit log }
- { code: "audit:payroll-ledger:read:org",   description: Read the payroll-ledger entries }
- { code: "audit:payroll-ledger:verify:org", description: Run payroll-ledger hash-chain verification }
```

- [ ] **Step 7: Create the default-roles fixture**

Create `apps/api/modules/identity/fixtures/default_roles.yaml`:

```yaml
# System roles seeded for every org. Permission code lists are M1b-scoped only;
# later milestones add to these as their modules ship.

- code: org_admin
  name: Organization Admin
  description: Full org configuration; user/role management
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:invite
    - user:edit
    - user:disable
    - user:delete
    - user:read:self
    - user:read:team
    - user:read:org
    - role:read
    - role:write
    - permission:read
    - department:read
    - department:write
    - org:settings:read
    - org:settings:write
    - audit:read:org
    - audit:payroll-ledger:read:org
    - audit:payroll-ledger:verify:org

- code: hr_manager
  name: HR Manager
  description: HR module access; user invites and edits; org settings read
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:invite
    - user:edit
    - user:disable
    - user:read:self
    - user:read:team
    - user:read:org
    - role:read
    - permission:read
    - department:read
    - department:write
    - org:settings:read
    - audit:read:org
    - "audit:payroll-ledger:read:org"

- code: finance
  name: Finance
  description: Final claims approval; payroll publish; financial reports
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:read:self
    - user:read:team
    - role:read
    - permission:read
    - department:read

- code: manager
  name: Manager
  description: Approve leave & claims for direct reports; team views
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:read:self
    - user:read:team
    - role:read
    - department:read

- code: team_lead
  name: Team Lead
  description: Like manager, but cannot approve claims (only leave)
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:read:self
    - user:read:team
    - role:read
    - department:read

- code: employee
  name: Employee
  description: Self-service portal access
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:read:self

- code: auditor
  name: Auditor
  description: Read-only across modules including audit log
  is_system: true
  permissions:
    - auth:mfa:manage:self
    - user:read:self
    - user:read:team
    - user:read:org
    - role:read
    - permission:read
    - department:read
    - org:settings:read
    - audit:read:org
    - "audit:payroll-ledger:read:org"
```

- [ ] **Step 8: Write the seed-command tests first**

Create `apps/api/modules/identity/tests/test_seed_commands.py`:

```python
"""Tests for seed_permission_catalogue and seed_default_roles."""
import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m1b_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check a few critical ones
    assert "auth:mfa:manage:self" in codes
    assert "user:invite" in codes
    assert "department:write" in codes
    assert "audit:payroll-ledger:verify:org" in codes
    assert len(codes) >= 18


@pytest.mark.django_db
def test_seed_permission_catalogue_idempotent() -> None:
    call_command("seed_permission_catalogue")
    n = Permission.objects.count()
    call_command("seed_permission_catalogue")
    assert Permission.objects.count() == n


@pytest.mark.django_db
def test_seed_default_roles_creates_seven_roles_for_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    codes = set(Role.objects.filter(org_id=org_id).values_list("code", flat=True))
    assert codes == {"org_admin", "hr_manager", "finance", "manager", "team_lead", "employee", "auditor"}


@pytest.mark.django_db
def test_seed_default_roles_links_permissions() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    org_admin = Role.objects.get(org_id=org_id, code="org_admin")
    perm_codes = set(org_admin.permissions.values_list("code", flat=True))
    assert "user:invite" in perm_codes
    assert "audit:payroll-ledger:verify:org" in perm_codes


@pytest.mark.django_db
def test_seed_default_roles_idempotent_per_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    n_roles = Role.objects.filter(org_id=org_id).count()
    n_links = RolePermission.objects.filter(role__org_id=org_id).count()

    call_command("seed_default_roles", "--org-id", str(org_id))
    assert Role.objects.filter(org_id=org_id).count() == n_roles
    assert RolePermission.objects.filter(role__org_id=org_id).count() == n_links


@pytest.mark.django_db
def test_seed_default_roles_requires_existing_permissions() -> None:
    """If permission catalogue hasn't been seeded yet, seeding roles should error clearly."""
    from django.core.management.base import CommandError

    org_id = uuid.uuid4()
    with pytest.raises(CommandError):
        call_command("seed_default_roles", "--org-id", str(org_id))
```

- [ ] **Step 9: Implement `seed_permission_catalogue` command**

Create `apps/api/modules/identity/management/commands/seed_permission_catalogue.py`:

```python
"""Idempotent loader for the permission catalogue.

Each milestone adds its own permission codes via additional fixtures.
This command loads ALL fixtures named permissions_*.yaml in
modules/identity/fixtures/.

Usage:
    python manage.py seed_permission_catalogue
"""
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand
from django.db import transaction

from modules.identity.models import Permission


class Command(BaseCommand):
    help = "Load all permission catalogues from modules/identity/fixtures/permissions_*.yaml."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
        files = sorted(fixtures_dir.glob("permissions_*.yaml"))
        if not files:
            self.stderr.write("No permission fixtures found.")
            return

        total_new = 0
        total_seen = 0
        for f in files:
            with f.open() as fh:
                entries = yaml.safe_load(fh) or []
            for e in entries:
                _, created = Permission.objects.update_or_create(
                    code=e["code"],
                    defaults={"description": e.get("description", "")},
                )
                total_seen += 1
                if created:
                    total_new += 1

        self.stdout.write(self.style.SUCCESS(
            f"Permission catalogue: {total_seen} entries seen, {total_new} created/updated."
        ))
```

- [ ] **Step 10: Implement `seed_default_roles` command**

Create `apps/api/modules/identity/management/commands/seed_default_roles.py`:

```python
"""Idempotent loader for default system roles per org.

Reads modules/identity/fixtures/default_roles.yaml and creates one Role per
entry (scoped to the given org_id), linking the listed permission codes.

Requires the permission catalogue to be seeded first; raises CommandError
otherwise.

Usage:
    python manage.py seed_default_roles --org-id <uuid>
"""
import uuid
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.identity.models import Permission, Role, RolePermission


class Command(BaseCommand):
    help = "Seed system role bundles (org_admin, hr_manager, ...) for an org."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-id",
            required=True,
            help="UUID of the organization whose roles should be seeded.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        try:
            org_id = uuid.UUID(options["org_id"])
        except ValueError as exc:
            raise CommandError(f"--org-id must be a valid UUID: {exc}") from exc

        fixture = (
            Path(__file__).resolve().parent.parent.parent
            / "fixtures"
            / "default_roles.yaml"
        )
        with fixture.open() as fh:
            entries = yaml.safe_load(fh) or []

        all_perms_in_fixture = {p for e in entries for p in e.get("permissions", [])}
        db_perms = dict(Permission.objects.filter(code__in=all_perms_in_fixture).values_list("code", "id"))
        missing = all_perms_in_fixture - db_perms.keys()
        if missing:
            raise CommandError(
                "Permission catalogue is missing required codes; run "
                "`seed_permission_catalogue` first. Missing: " + ", ".join(sorted(missing))
            )

        n_roles = 0
        n_links_total = 0
        for entry in entries:
            role, _ = Role.objects.update_or_create(
                org_id=org_id,
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "description": entry.get("description", ""),
                    "is_system": entry.get("is_system", True),
                },
            )
            n_roles += 1

            # Sync permission links to match the fixture exactly (drop, then add).
            existing_perm_ids = set(role.role_permissions.values_list("permission_id", flat=True))
            wanted_perm_ids = {db_perms[c] for c in entry.get("permissions", [])}

            to_add = wanted_perm_ids - existing_perm_ids
            to_remove = existing_perm_ids - wanted_perm_ids

            if to_add:
                RolePermission.objects.bulk_create(
                    [RolePermission(role=role, permission_id=pid) for pid in to_add],
                    ignore_conflicts=True,
                )
            if to_remove:
                RolePermission.objects.filter(role=role, permission_id__in=to_remove).delete()

            n_links_total += len(wanted_perm_ids)

        self.stdout.write(self.style.SUCCESS(
            f"Default roles for org {org_id}: {n_roles} roles, {n_links_total} permission links."
        ))
```

- [ ] **Step 11: Run seed-command tests — expect PASS**

```
cd apps/api && uv run pytest modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -15; cd ../..
```
Expected: 6 tests pass.

- [ ] **Step 12: Run the full identity test suite + manage.py check**

```
cd apps/api && \
  uv run pytest modules/identity/ -v 2>&1 | tail -10 && \
  uv run python manage.py check 2>&1 | tail -3 && \
  cd ../..
```
Expected: ~24 tests pass; system check clean.

- [ ] **Step 13: Update admin to register the role/permission models**

Edit `apps/api/modules/identity/admin.py`. Append:

```python
from .models import Permission, Role, RolePermission, UserRole


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "org_id", "is_system")
    list_filter = ("org_id", "is_system")
    search_fields = ("code", "name")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "permission")
    list_filter = ("role__org_id",)
    search_fields = ("role__code", "permission__code")


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "granted_by", "granted_at")
    search_fields = ("user__email", "role__code")
```

- [ ] **Step 14: Commit Task 2**

```
git add apps/api/modules/identity/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): Permission catalogue, Role bundles, UserRole + M1b seeders"
```

---

## M1b-1 Acceptance Criteria

When this plan is fully executed:

- [ ] `make migrate` applies all migrations cleanly on a fresh postgres
- [ ] `python manage.py seed_permission_catalogue` populates 18+ permission codes, idempotent
- [ ] `python manage.py seed_default_roles --org-id <uuid>` creates 7 system roles for the given org, idempotent
- [ ] `pytest modules/identity/` is green (~24 tests)
- [ ] `manage.py check` reports no issues
- [ ] User created via Django admin or `User.objects.create_user(...)` has email-uniqueness enforced per-org
- [ ] `make lint` clean
- [ ] `pre-commit run --all-files` clean
- [ ] No `TODO`/`TBD`/`FIXME` left in committed code

That is M1b-1. Next plan: **M1b-2 — Auth endpoints + MFA + Sessions** — wires JWT login flow and TOTP MFA on top of this user model.
