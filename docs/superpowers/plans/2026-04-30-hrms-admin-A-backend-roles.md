# HRMS Admin Tools — Sub-plan A: Backend Role Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend infrastructure for Features 1 and 2 — admin can list/get/PATCH role permissions, reset to defaults, and assign roles to users via curl. No UI yet.

**Architecture:** Endpoints live in `apps/api/modules/identity/views.py` (extending the existing module). Service-layer helpers in `apps/api/modules/identity/services/permissions.py` enforce all lockout protection and audit-log writes. The existing `seed_default_roles` command flips from "sync" to "create-if-absent" semantics so admin edits stick.

**Tech Stack:** Django 5 · DRF · Argon2id · pytest · drf-spectacular for OpenAPI.

**Spec reference:** `docs/superpowers/specs/2026-04-30-hrms-admin-tools.md` §1 (architecture), §2 (Feature 1), §3 (Feature 2), §5 (lockout protection + audit + seed change).

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/modules/identity/fixtures/permissions_m1b.yaml` | Add `org:feature_flag:read`, `org:feature_flag:write` |
| Modify | `apps/api/modules/identity/fixtures/default_roles.yaml` | Grant the two new perms to `org_admin` |
| Modify | `apps/api/modules/identity/management/commands/seed_default_roles.py` | "Create-if-absent" semantics |
| Test | `apps/api/modules/identity/tests/test_seed_default_roles.py` | Verify create-if-absent + permission catalogue |
| Modify | `apps/api/modules/identity/services/permissions.py` | `assign_roles_to_user`, `set_role_permissions`, `reset_role_to_defaults` helpers |
| Test | `apps/api/modules/identity/tests/test_user_roles_admin.py` | Feature 1 service + endpoint tests |
| Test | `apps/api/modules/identity/tests/test_roles_admin.py` | Feature 2 service + endpoint tests |
| Modify | `apps/api/modules/identity/serializers.py` | `RoleDetailSerializer`, `AssignRolesInputSerializer`, `RolePermissionsInputSerializer` |
| Modify | `apps/api/modules/identity/views.py` | `RoleViewSet`, `role_permissions_view`, `role_reset_view`, `assign_user_roles_view` |
| Modify | `apps/api/modules/identity/urls.py` | Wire new endpoints |

---

## Task 1: Add `org:feature_flag` permissions to catalogue

**Files:**
- Modify: `apps/api/modules/identity/fixtures/permissions_m1b.yaml`

- [ ] **Step 1: Read the existing file**

```bash
grep -n "role:read\|role:write\|org:" apps/api/modules/identity/fixtures/permissions_m1b.yaml | head -10
```

Expected output: existing `role:read`, `role:write`, `org:settings:read`, `org:settings:write` permissions.

- [ ] **Step 2: Append two new permission codes**

Edit `apps/api/modules/identity/fixtures/permissions_m1b.yaml` and add at the end of the file (after the last existing entry — preserve the existing YAML list style):

```yaml
- { code: org:feature_flag:read,  description: Read feature flag state for the org }
- { code: org:feature_flag:write, description: Toggle feature flags for the org }
```

- [ ] **Step 3: Re-run the catalogue seed inside the api container**

```bash
sg docker -c 'docker compose -f /home/universal/Claude/HR_Management/deploy/docker-compose.yml exec -T api uv run python manage.py seed_permission_catalogue'
```

Expected: prints "Permission catalogue: 107 entries seen, 107 created/updated." (was 105, now 107).

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/identity/fixtures/permissions_m1b.yaml
git commit -m "feat(identity): add org:feature_flag:{read,write} permission codes"
```

---

## Task 2: Grant `org:feature_flag:*` to `org_admin`

**Files:**
- Modify: `apps/api/modules/identity/fixtures/default_roles.yaml`

- [ ] **Step 1: Find the `org_admin` permission list**

```bash
grep -n "^- code: org_admin" apps/api/modules/identity/fixtures/default_roles.yaml
```

The org_admin entry starts there. Read the next ~50 lines to see its `permissions:` list.

- [ ] **Step 2: Insert the two new permissions after `role:write`**

Edit `apps/api/modules/identity/fixtures/default_roles.yaml`. In the `org_admin` role's `permissions:` list, after `- role:write` add:

```yaml
    - org:feature_flag:read
    - org:feature_flag:write
```

(Keep the same indentation as the surrounding lines — 4 spaces + `- `.)

- [ ] **Step 3: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('apps/api/modules/identity/fixtures/default_roles.yaml'))"
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/identity/fixtures/default_roles.yaml
git commit -m "feat(identity): grant org:feature_flag:{read,write} to org_admin"
```

---

## Task 3: Switch `seed_default_roles` to "create-if-absent"

**Files:**
- Modify: `apps/api/modules/identity/management/commands/seed_default_roles.py`
- Test: `apps/api/modules/identity/tests/test_seed_default_roles.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/modules/identity/tests/test_seed_default_roles.py`:

```python
"""Regression: seed_default_roles must preserve admin edits to existing roles."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_first_run_creates_roles(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))
    assert Role.objects.filter(org_id=org.id, code="org_admin").exists()
    assert Role.objects.filter(org_id=org.id, code="manager").exists()


@pytest.mark.django_db
def test_re_run_preserves_admin_edits_to_existing_roles(org):
    """Admin removes a perm from `manager`. Re-running the seed must NOT add it back."""
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))

    # Admin removes leave:request:approve:team from manager
    manager = Role.objects.get(org_id=org.id, code="manager")
    perm = Permission.objects.get(code="leave:request:approve:team")
    deleted_count, _ = RolePermission.objects.filter(role=manager, permission=perm).delete()
    assert deleted_count == 1

    # Re-run the seed
    call_command("seed_default_roles", "--org-id", str(org.id))

    # The permission should NOT be back
    still_missing = not RolePermission.objects.filter(role=manager, permission=perm).exists()
    assert still_missing, "seed_default_roles re-added a permission an admin removed"


@pytest.mark.django_db
def test_re_run_does_not_duplicate_permissions(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))
    initial_count = RolePermission.objects.count()

    call_command("seed_default_roles", "--org-id", str(org.id))
    after_count = RolePermission.objects.count()

    assert initial_count == after_count
```

- [ ] **Step 2: Run the tests — expect 2 failures**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_seed_default_roles.py -v
```

Expected: `test_first_run_creates_roles` PASSES, `test_re_run_preserves_admin_edits_to_existing_roles` FAILS (current behavior re-adds the permission), `test_re_run_does_not_duplicate_permissions` PASSES (the existing sync logic is idempotent in count terms).

- [ ] **Step 3: Modify the seed command**

Open `apps/api/modules/identity/management/commands/seed_default_roles.py`. Find the block that does the role+permission sync (around line 60-82 — the `update_or_create` for Role followed by the `existing_perm_ids` / `wanted_perm_ids` diff). Replace with create-if-absent logic:

```python
            role, created = Role.objects.get_or_create(
                org_id=org.id,
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "description": entry.get("description", ""),
                    "is_system": entry.get("is_system", True),
                },
            )
            n_roles += 1

            # Only seed permissions when the Role is brand-new. Existing roles'
            # permission sets are sacred — admin may have customized them via
            # the /admin/roles UI. Use the "Reset to defaults" endpoint to opt
            # back into the fixture's set.
            if created:
                wanted_perm_ids = {db_perms[c] for c in entry.get("permissions", [])}
                RolePermission.objects.bulk_create(
                    [RolePermission(role=role, permission_id=pid) for pid in wanted_perm_ids],
                    ignore_conflicts=True,
                )
                n_links_total += len(wanted_perm_ids)
            else:
                # Count existing perms for the summary line — no mutation.
                n_links_total += role.role_permissions.count()
```

(If the surrounding code uses different variable names, keep them — only change the `update_or_create` call to `get_or_create` and gate the permission-sync block on `if created:`.)

- [ ] **Step 4: Re-run the tests — expect all 3 passing**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_seed_default_roles.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Run the full identity test suite to verify no regressions**

```bash
cd apps/api && uv run pytest modules/identity/ -q
```

Expected: all green (the existing identity tests don't depend on seed-resync behavior).

- [ ] **Step 6: Commit**

```bash
git add apps/api/modules/identity/management/commands/seed_default_roles.py \
        apps/api/modules/identity/tests/test_seed_default_roles.py
git commit -m "feat(identity): seed_default_roles uses create-if-absent (preserves admin edits)"
```

---

## Task 4: `assign_roles_to_user` service helper

**Files:**
- Modify: `apps/api/modules/identity/services/permissions.py`
- Test: `apps/api/modules/identity/tests/test_user_roles_admin.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/modules/identity/tests/test_user_roles_admin.py`:

```python
"""Tests for the user-role assignment service + endpoint (Feature 1)."""

import pytest
from django.core.management import call_command

from modules.identity.models import Role, User, UserRole
from modules.identity.services.permissions import (
    LastAdminError,
    SelfDemoteError,
    UnknownRoleError,
    assign_roles_to_user,
)
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture(autouse=True)
def seed_roles(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _user(org, email):
    return User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret


def _grant(user, code):
    role = Role.objects.get(org_id=user.org_id, code=code)
    UserRole.objects.create(user=user, role=role)


@pytest.mark.django_db
def test_assign_roles_replaces_set(org):
    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    _grant(target, "employee")

    assign_roles_to_user(actor=admin, target=target, role_codes=["manager", "team_lead"])

    target_codes = set(UserRole.objects.filter(user=target).values_list("role__code", flat=True))
    assert target_codes == {"manager", "team_lead"}  # employee dropped


@pytest.mark.django_db
def test_assign_roles_unknown_code_raises(org):
    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    with pytest.raises(UnknownRoleError):
        assign_roles_to_user(actor=admin, target=target, role_codes=["manager", "ceo"])


@pytest.mark.django_db
def test_assign_roles_self_demote_blocked(org):
    """Removing your own org_admin role from yourself is refused."""
    admin = _user(org, "admin@a.com")
    other = _user(org, "other@a.com")
    _grant(admin, "org_admin")
    _grant(other, "org_admin")  # ensure not the last admin
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])


@pytest.mark.django_db
def test_assign_roles_last_admin_blocked(org):
    """Removing org_admin from the last admin in the org is refused."""
    admin = _user(org, "admin@a.com")
    other = _user(org, "other@a.com")
    _grant(admin, "org_admin")
    # only one admin; admin is removing it from `other` who doesn't have it — ok
    # but if admin tries to remove org_admin from themselves and they're alone...
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])

    # Different scenario: admin demotes the only OTHER admin — also last-admin
    admin2 = _user(org, "admin2@a.com")
    _grant(admin2, "org_admin")
    # Now there are 2 admins. Demote admin2 — should succeed.
    assign_roles_to_user(actor=admin, target=admin2, role_codes=["manager"])
    assert UserRole.objects.filter(user=admin2, role__code="org_admin").count() == 0

    # Now admin is the last admin; admin trying to demote themselves blocked.
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])


@pytest.mark.django_db
def test_assign_roles_idempotent(org):
    """Same set in → no-op, no audit rows."""
    from common.audit.models import AuditLog
    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    _grant(target, "manager")

    initial_audit = AuditLog.objects.count()
    assign_roles_to_user(actor=admin, target=target, role_codes=["manager"])
    assert AuditLog.objects.count() == initial_audit  # no diff, no audit
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_user_roles_admin.py -v
```

Expected: ImportError on `assign_roles_to_user`, `UnknownRoleError`, `SelfDemoteError`, `LastAdminError`.

- [ ] **Step 3: Add the service helper + exceptions to `permissions.py`**

Open `apps/api/modules/identity/services/permissions.py`. Add at the bottom of the file:

```python
# --- Admin: role assignment ---------------------------------------------


class UnknownRoleError(Exception):
    """Raised when a role_code in the assign request doesn't exist in the org."""


class SelfDemoteError(Exception):
    """Raised when actor tries to remove their own org_admin role."""


class LastAdminError(Exception):
    """Raised when removing org_admin would leave the org with zero admins."""


def assign_roles_to_user(*, actor, target, role_codes: list[str]):
    """Replace the target user's role set in the actor's org.

    - Validates every code exists in the target's org.
    - Refuses if actor == target AND new set drops org_admin.
    - Refuses if removing org_admin from anyone would leave zero admins.
    - Writes audit rows: user.role_granted (per added) + user.role_revoked (per removed).
    - Idempotent: same set in → zero audit rows, zero DB writes.

    Raises UnknownRoleError, SelfDemoteError, LastAdminError.
    """
    from common.audit import services as audit
    from modules.identity.models import Role, UserRole

    role_codes = list(dict.fromkeys(role_codes))  # dedupe, preserve order

    # Resolve all role codes in the target's org
    role_qs = Role.objects.filter(org_id=target.org_id, code__in=role_codes)
    found_by_code = {r.code: r for r in role_qs}
    missing = [c for c in role_codes if c not in found_by_code]
    if missing:
        raise UnknownRoleError(f"Unknown role code(s): {', '.join(missing)}")

    current_codes = set(
        UserRole.objects.filter(user=target).values_list("role__code", flat=True),
    )
    requested_codes = set(role_codes)
    to_add = requested_codes - current_codes
    to_remove = current_codes - requested_codes

    # Lockout guard 1: self-demote
    if actor.id == target.id and "org_admin" in current_codes and "org_admin" not in requested_codes:
        raise SelfDemoteError(
            "You can't remove your own org_admin role. Ask another admin first.",
        )

    # Lockout guard 2: last admin in org
    if "org_admin" in to_remove:
        remaining_admins = (
            UserRole.objects.filter(role__org_id=target.org_id, role__code="org_admin")
            .exclude(user=target)
            .count()
        )
        if remaining_admins == 0:
            raise LastAdminError(
                "At least one user in this organisation must be an org_admin. "
                "Grant the role to someone else first.",
            )

    # Apply changes
    for code in to_remove:
        role = Role.objects.get(org_id=target.org_id, code=code)
        UserRole.objects.filter(user=target, role=role).delete()
        audit.append(
            "user.role_revoked",
            actor=actor,
            subject_id=target.id,
            payload={"role_code": code},
        )
    for code in to_add:
        role = found_by_code[code]
        UserRole.objects.create(user=target, role=role, granted_by=actor)
        audit.append(
            "user.role_granted",
            actor=actor,
            subject_id=target.id,
            payload={"role_code": code},
        )
```

(If `common.audit.services.append` has a different signature in your codebase, adjust the calls. The audit module is established; check `common/audit/services.py` for the actual API.)

- [ ] **Step 4: Run the tests — expect all passing**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_user_roles_admin.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/modules/identity/services/permissions.py \
        apps/api/modules/identity/tests/test_user_roles_admin.py
git commit -m "feat(identity): assign_roles_to_user service with self-demote + last-admin guards"
```

---

## Task 5: `set_role_permissions` service helper

**Files:**
- Modify: `apps/api/modules/identity/services/permissions.py`
- Test: `apps/api/modules/identity/tests/test_roles_admin.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/modules/identity/tests/test_roles_admin.py`:

```python
"""Tests for the role-permission editor service + endpoint (Feature 2)."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.identity.services.permissions import (
    LastWritePermissionHolderError,
    OrgAdminProtectionError,
    UnknownPermissionError,
    set_role_permissions,
)
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture(autouse=True)
def seed(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _admin_user(org):
    u = User.objects.create_user(email="admin@a.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.get(org_id=org.id, code="org_admin")
    UserRole.objects.create(user=u, role=role)
    return u


@pytest.mark.django_db
def test_set_permissions_happy_path(org):
    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    new_codes = ["leave:request:create:self", "approvals:inbox:read"]

    set_role_permissions(actor=actor, role_code="manager", permission_codes=new_codes)

    after = set(
        RolePermission.objects.filter(role=manager).values_list("permission__code", flat=True),
    )
    assert after == set(new_codes)


@pytest.mark.django_db
def test_unknown_permission_raises(org):
    actor = _admin_user(org)
    with pytest.raises(UnknownPermissionError):
        set_role_permissions(
            actor=actor,
            role_code="manager",
            permission_codes=["leave:request:create:self", "ceo:approve:everything"],
        )


@pytest.mark.django_db
def test_org_admin_keeps_critical_perms(org):
    actor = _admin_user(org)
    # Try to give org_admin a tiny set that drops role:write
    with pytest.raises(OrgAdminProtectionError):
        set_role_permissions(
            actor=actor,
            role_code="org_admin",
            permission_codes=["employee:read:self"],
        )


@pytest.mark.django_db
def test_last_write_holder_blocked(org):
    """If only `manager` holds payroll:run:create and we strip it, refuse."""
    actor = _admin_user(org)
    # Move payroll:run:create to a state where only `manager` holds it
    payroll_perm = Permission.objects.get(code="payroll:run:create")
    RolePermission.objects.filter(permission=payroll_perm).delete()
    manager = Role.objects.get(org_id=org.id, code="manager")
    RolePermission.objects.create(role=manager, permission=payroll_perm)

    # Try to PATCH manager to a set without payroll:run:create — should refuse
    with pytest.raises(LastWritePermissionHolderError) as exc:
        set_role_permissions(
            actor=actor,
            role_code="manager",
            permission_codes=["leave:request:create:self"],
        )
    assert "payroll:run:create" in str(exc.value)


@pytest.mark.django_db
def test_idempotent_no_audit(org):
    from common.audit.models import AuditLog
    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    current = list(
        RolePermission.objects.filter(role=manager).values_list("permission__code", flat=True),
    )
    initial_audit = AuditLog.objects.count()
    set_role_permissions(actor=actor, role_code="manager", permission_codes=current)
    assert AuditLog.objects.count() == initial_audit
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_roles_admin.py -v
```

Expected: ImportError on `set_role_permissions`, `UnknownPermissionError`, `OrgAdminProtectionError`, `LastWritePermissionHolderError`.

- [ ] **Step 3: Add the service helper to `permissions.py`**

Append to `apps/api/modules/identity/services/permissions.py`:

```python
# --- Admin: role permission editor --------------------------------------


# Permissions that org_admin must never lose (Section 5 rule 1 in spec).
ORG_ADMIN_REQUIRED_PERMS = frozenset({
    "role:read",
    "role:write",
    "org:feature_flag:read",
    "org:feature_flag:write",
})


class UnknownPermissionError(Exception):
    pass


class OrgAdminProtectionError(Exception):
    pass


class LastWritePermissionHolderError(Exception):
    pass


def _is_protected_admin_perm(code: str) -> bool:
    """org_admin must keep these. Includes any identity:* perm."""
    return code in ORG_ADMIN_REQUIRED_PERMS or code.startswith("identity:")


def set_role_permissions(*, actor, role_code: str, permission_codes: list[str]):
    """Replace the role's permission set within the actor's org.

    - Validates every code exists in the catalogue.
    - org_admin must keep ORG_ADMIN_REQUIRED_PERMS + all identity:* perms.
    - At least one role in the org must hold each *:write and *:approve perm.
    - Audit row: role.permissions_changed with {added, removed} payload.
    - Idempotent.

    Raises UnknownPermissionError, OrgAdminProtectionError,
    LastWritePermissionHolderError.
    """
    from common.audit import services as audit

    permission_codes = list(dict.fromkeys(permission_codes))

    # Validate every code is in the catalogue
    found = set(
        Permission.objects.filter(code__in=permission_codes).values_list("code", flat=True),
    )
    missing = [c for c in permission_codes if c not in found]
    if missing:
        raise UnknownPermissionError(f"Unknown permission code(s): {', '.join(missing)}")

    role = Role.objects.get(org_id=actor.org_id, code=role_code)
    requested = set(permission_codes)
    current = set(
        RolePermission.objects.filter(role=role).values_list("permission__code", flat=True),
    )
    to_add = requested - current
    to_remove = current - requested

    # Guard 1: org_admin keeps required perms
    if role_code == "org_admin":
        stripping_protected = [c for c in to_remove if _is_protected_admin_perm(c)]
        if stripping_protected:
            raise OrgAdminProtectionError(
                f"org_admin must retain identity admin perms: {sorted(stripping_protected)}",
            )

    # Guard 2: at least one role must hold each *:write or *:approve perm
    for code in to_remove:
        if not (":write" in code or ":approve" in code):
            continue
        # Count OTHER roles in the same org that hold this perm
        other_holders = (
            RolePermission.objects.filter(
                role__org_id=actor.org_id,
                permission__code=code,
            )
            .exclude(role_id=role.id)
            .exists()
        )
        if not other_holders:
            raise LastWritePermissionHolderError(
                f"This change would leave nobody able to {code}. "
                f"Grant {code} to another role first.",
            )

    if not to_add and not to_remove:
        return  # idempotent — no audit, no DB writes

    # Apply
    if to_remove:
        RolePermission.objects.filter(
            role=role, permission__code__in=to_remove,
        ).delete()
    if to_add:
        perm_ids = list(
            Permission.objects.filter(code__in=to_add).values_list("id", flat=True),
        )
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_id=pid) for pid in perm_ids],
            ignore_conflicts=True,
        )

    audit.append(
        "role.permissions_changed",
        actor=actor,
        subject_id=role.id,
        payload={"role_code": role_code, "added": sorted(to_add), "removed": sorted(to_remove)},
    )
```

- [ ] **Step 4: Run the tests — expect all passing**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_roles_admin.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/modules/identity/services/permissions.py \
        apps/api/modules/identity/tests/test_roles_admin.py
git commit -m "feat(identity): set_role_permissions with org_admin + last-holder guards"
```

---

## Task 6: `reset_role_to_defaults` service helper

**Files:**
- Modify: `apps/api/modules/identity/services/permissions.py`
- Test: `apps/api/modules/identity/tests/test_roles_admin.py`

- [ ] **Step 1: Add the test**

Append to `apps/api/modules/identity/tests/test_roles_admin.py`:

```python
@pytest.mark.django_db
def test_reset_to_defaults(org):
    """Reset re-applies the fixture's permissions for that role."""
    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    # Strip manager to nothing
    RolePermission.objects.filter(role=manager).delete()
    assert RolePermission.objects.filter(role=manager).count() == 0

    from modules.identity.services.permissions import reset_role_to_defaults
    reset_role_to_defaults(actor=actor, role_code="manager")

    after = RolePermission.objects.filter(role=manager).count()
    assert after > 0  # fixture restored some perms

    # Audit row written
    from common.audit.models import AuditLog
    assert AuditLog.objects.filter(action="role.reset_to_defaults").exists()
```

- [ ] **Step 2: Run — expect ImportError**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_roles_admin.py::test_reset_to_defaults -v
```

Expected: ImportError on `reset_role_to_defaults`.

- [ ] **Step 3: Add the helper**

Append to `apps/api/modules/identity/services/permissions.py`:

```python
def reset_role_to_defaults(*, actor, role_code: str):
    """Re-apply the fixture's default perms for this role, dropping admin edits.

    The fixture at modules/identity/fixtures/default_roles.yaml is the
    single source of truth for "default" role permission sets.
    """
    import yaml
    from pathlib import Path

    from common.audit import services as audit

    fixture_path = (
        Path(__file__).resolve().parent.parent
        / "fixtures"
        / "default_roles.yaml"
    )
    with fixture_path.open() as f:
        entries = yaml.safe_load(f)
    entry = next((e for e in entries if e["code"] == role_code), None)
    if entry is None:
        raise UnknownRoleError(f"No default fixture for role code: {role_code}")

    role = Role.objects.get(org_id=actor.org_id, code=role_code)
    wanted_codes = entry.get("permissions", [])
    perm_ids = list(
        Permission.objects.filter(code__in=wanted_codes).values_list("id", flat=True),
    )

    # Replace
    RolePermission.objects.filter(role=role).delete()
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission_id=pid) for pid in perm_ids],
        ignore_conflicts=True,
    )

    audit.append(
        "role.reset_to_defaults",
        actor=actor,
        subject_id=role.id,
        payload={"role_code": role_code, "permissions_after": sorted(wanted_codes)},
    )
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_roles_admin.py::test_reset_to_defaults -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/modules/identity/services/permissions.py \
        apps/api/modules/identity/tests/test_roles_admin.py
git commit -m "feat(identity): reset_role_to_defaults reads fixture as source of truth"
```

---

## Task 7: Serializers for the admin endpoints

**Files:**
- Modify: `apps/api/modules/identity/serializers.py`

- [ ] **Step 1: Read the existing serializers file**

```bash
grep -n "^class " apps/api/modules/identity/serializers.py | head
```

Note the existing `MeSerializer` and pattern.

- [ ] **Step 2: Append the three new serializers**

Append to `apps/api/modules/identity/serializers.py`:

```python
# --- Admin: roles + assignment ---------------------------------------------


class RoleListItemSerializer(serializers.ModelSerializer):
    """Used for the list endpoint."""
    permission_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "code", "name", "description", "is_system", "permission_count", "user_count"]

    def get_permission_count(self, obj):
        return obj.role_permissions.count()

    def get_user_count(self, obj):
        from modules.identity.models import UserRole
        return UserRole.objects.filter(role=obj).count()


class RoleDetailSerializer(serializers.ModelSerializer):
    """Used for retrieve. Includes full permission_codes[]."""
    permission_codes = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "code", "name", "description", "is_system", "permission_codes", "user_count"]

    def get_permission_codes(self, obj):
        return list(
            obj.role_permissions.values_list("permission__code", flat=True).order_by("permission__code"),
        )

    def get_user_count(self, obj):
        from modules.identity.models import UserRole
        return UserRole.objects.filter(role=obj).count()


class RolePermissionsInputSerializer(serializers.Serializer):
    """Body for PATCH /roles/{code}/permissions/."""
    permission_codes = serializers.ListField(child=serializers.CharField(), allow_empty=True)


class AssignRolesInputSerializer(serializers.Serializer):
    """Body for PATCH /users/{id}/roles/."""
    role_codes = serializers.ListField(child=serializers.CharField(), allow_empty=True)
```

If `Role` and `serializers` imports aren't at the top of the file, add the imports:

```python
from rest_framework import serializers
from modules.identity.models import Role
```

(Use whatever import style matches the existing file — most identity files already import these.)

- [ ] **Step 3: Verify Django can import**

```bash
cd apps/api && uv run python manage.py check
```

Expected: "System check identified no issues (0 silenced)."

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/identity/serializers.py
git commit -m "feat(identity): role admin serializers (list/detail/perm-input/assign-input)"
```

---

## Task 8: `RoleViewSet` + `role_permissions_view` + `role_reset_view`

**Files:**
- Modify: `apps/api/modules/identity/views.py`

- [ ] **Step 1: Append the views**

Append to `apps/api/modules/identity/views.py`:

```python
# --- Admin: role admin endpoints (Feature 2) -----------------------------

from rest_framework import viewsets
from rest_framework.decorators import action

from modules.identity.permissions import HRMSPermission
from modules.identity.serializers import (
    AssignRolesInputSerializer,
    RoleDetailSerializer,
    RoleListItemSerializer,
    RolePermissionsInputSerializer,
)
from modules.identity.services.permissions import (
    LastAdminError,
    LastWritePermissionHolderError,
    OrgAdminProtectionError,
    SelfDemoteError,
    UnknownPermissionError,
    UnknownRoleError,
    assign_roles_to_user,
    reset_role_to_defaults,
    set_role_permissions,
)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """List + retrieve roles in the actor's org."""

    permission_classes = [HRMSPermission]
    required_perms = ["role:read"]
    lookup_field = "code"

    def get_queryset(self):
        return Role.objects.filter(org_id=self.request.user.org_id).order_by("code")

    def get_serializer_class(self):
        if self.action == "list":
            return RoleListItemSerializer
        return RoleDetailSerializer


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def role_permissions_view(request, code: str):
    """PATCH /api/v1/roles/{code}/permissions/

    Body: {"permission_codes": ["...", "..."]}
    """
    perms = HRMSPermission()
    if "role:write" not in {p for p in perms.user_perms(request.user)}:
        return Response({"detail": "Permission denied"}, status=403)

    serializer = RolePermissionsInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        set_role_permissions(
            actor=request.user,
            role_code=code,
            permission_codes=serializer.validated_data["permission_codes"],
        )
    except Role.DoesNotExist:
        return Response({"detail": f"Role '{code}' not found"}, status=404)
    except UnknownPermissionError as exc:
        return Response({"detail": str(exc)}, status=400)
    except OrgAdminProtectionError as exc:
        return Response({"detail": str(exc)}, status=400)
    except LastWritePermissionHolderError as exc:
        return Response({"detail": str(exc)}, status=400)

    role = Role.objects.get(org_id=request.user.org_id, code=code)
    return Response(RoleDetailSerializer(role).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def role_reset_view(request, code: str):
    """POST /api/v1/roles/{code}/reset-to-defaults/"""
    perms = HRMSPermission()
    if "role:write" not in {p for p in perms.user_perms(request.user)}:
        return Response({"detail": "Permission denied"}, status=403)

    try:
        reset_role_to_defaults(actor=request.user, role_code=code)
    except UnknownRoleError as exc:
        return Response({"detail": str(exc)}, status=404)

    role = Role.objects.get(org_id=request.user.org_id, code=code)
    return Response(RoleDetailSerializer(role).data)
```

(If `HRMSPermission` exposes `user_perms` differently in your codebase, adapt — the goal is "current user has `role:write`". The existing perm-check pattern in this file is the source of truth.)

- [ ] **Step 2: Verify Django imports cleanly**

```bash
cd apps/api && uv run python manage.py check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/modules/identity/views.py
git commit -m "feat(identity): RoleViewSet + role_permissions_view + role_reset_view"
```

---

## Task 9: `assign_user_roles_view`

**Files:**
- Modify: `apps/api/modules/identity/views.py`

- [ ] **Step 1: Append the view**

Append to `apps/api/modules/identity/views.py`:

```python
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def assign_user_roles_view(request, user_id: str):
    """PATCH /api/v1/users/{user_id}/roles/

    Body: {"role_codes": ["manager", "team_lead"]}
    """
    perms = HRMSPermission()
    if "role:write" not in {p for p in perms.user_perms(request.user)}:
        return Response({"detail": "Permission denied"}, status=403)

    serializer = AssignRolesInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        target = User.objects.get(id=user_id, org_id=request.user.org_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found"}, status=404)

    try:
        assign_roles_to_user(
            actor=request.user,
            target=target,
            role_codes=serializer.validated_data["role_codes"],
        )
    except UnknownRoleError as exc:
        return Response({"detail": str(exc)}, status=400)
    except SelfDemoteError as exc:
        return Response({"detail": str(exc)}, status=400)
    except LastAdminError as exc:
        return Response({"detail": str(exc)}, status=400)

    # Build effective permissions list for response
    from modules.identity.services.permissions import get_user_perms
    role_codes = list(
        UserRole.objects.filter(user=target).values_list("role__code", flat=True).order_by("role__code"),
    )
    return Response({
        "user_id": str(target.id),
        "email": target.email,
        "role_codes": role_codes,
        "permissions": sorted(get_user_perms(target)),
    })
```

(Verify `get_user_perms` exists at `modules.identity.services.permissions` — it's used in the existing me-view.)

- [ ] **Step 2: Verify imports**

```bash
cd apps/api && uv run python manage.py check
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/modules/identity/views.py
git commit -m "feat(identity): assign_user_roles_view (PATCH /users/{id}/roles/)"
```

---

## Task 10: URL wiring

**Files:**
- Modify: `apps/api/modules/identity/urls.py`

- [ ] **Step 1: Read the existing URLs**

```bash
cat apps/api/modules/identity/urls.py
```

Note the existing pattern (`path(...)` style or `router.register(...)` style — match it).

- [ ] **Step 2: Add the four new routes**

Edit `apps/api/modules/identity/urls.py`. Where existing routes live, add:

```python
from rest_framework.routers import DefaultRouter

from modules.identity.views import (
    RoleViewSet,
    assign_user_roles_view,
    role_permissions_view,
    role_reset_view,
)

# ... existing urlpatterns and router setup ...

router = DefaultRouter()  # or reuse existing one
router.register(r"roles", RoleViewSet, basename="role")

urlpatterns += [
    path("roles/<str:code>/permissions/", role_permissions_view, name="role-permissions"),
    path("roles/<str:code>/reset-to-defaults/", role_reset_view, name="role-reset"),
    path("users/<uuid:user_id>/roles/", assign_user_roles_view, name="user-roles-assign"),
] + router.urls
```

(Adapt to the existing file structure. The endpoints relative to the api.urls prefix should resolve to `/api/v1/roles/`, `/api/v1/roles/{code}/permissions/`, `/api/v1/roles/{code}/reset-to-defaults/`, `/api/v1/users/{id}/roles/`.)

- [ ] **Step 3: Smoke test the routes resolve**

```bash
cd apps/api && uv run python manage.py shell -c "from django.urls import reverse; print(reverse('role-list'))"
```

Expected: prints `/api/v1/roles/` (or whatever the prefixed path is). If it errors, the URL wiring is wrong.

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/identity/urls.py
git commit -m "feat(identity): wire role admin URLs"
```

---

## Task 11: End-to-end endpoint tests + audit verification

**Files:**
- Modify: `apps/api/modules/identity/tests/test_roles_admin.py`
- Modify: `apps/api/modules/identity/tests/test_user_roles_admin.py`

- [ ] **Step 1: Add endpoint tests to `test_roles_admin.py`**

Append to `apps/api/modules/identity/tests/test_roles_admin.py`:

```python
from rest_framework.test import APIClient


def _login(client, email):
    resp = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_endpoint_list_roles(org):
    actor = _admin_user(org)
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/roles/")
    assert resp.status_code == 200, resp.content
    codes = {r["code"] for r in resp.json()}
    assert {"org_admin", "manager", "employee"} <= codes


@pytest.mark.django_db
def test_endpoint_patch_permissions_writes_audit(org):
    from common.audit.models import AuditLog
    actor = _admin_user(org)
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    initial_audit = AuditLog.objects.filter(action="role.permissions_changed").count()
    resp = client.patch(
        "/api/v1/roles/manager/permissions/",
        {"permission_codes": ["leave:request:create:self"]},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    after_audit = AuditLog.objects.filter(action="role.permissions_changed").count()
    assert after_audit == initial_audit + 1


@pytest.mark.django_db
def test_endpoint_employee_cannot_patch(org):
    """Employee role lacks role:write — must 403."""
    emp = User.objects.create_user(email="emp@a.com", password="x", org_id=org.id)  # pragma: allowlist secret
    UserRole.objects.create(
        user=emp, role=Role.objects.get(org_id=org.id, code="employee"),
    )
    client = APIClient()
    token = _login(client, "emp@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.patch(
        "/api/v1/roles/manager/permissions/",
        {"permission_codes": []},
        format="json",
    )
    assert resp.status_code == 403, resp.content
```

- [ ] **Step 2: Add endpoint tests to `test_user_roles_admin.py`**

Append to `apps/api/modules/identity/tests/test_user_roles_admin.py`:

```python
from rest_framework.test import APIClient


def _login(client, email):
    resp = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},
        format="json",
    )
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_endpoint_assign_roles_writes_two_audit_rows(org):
    """One row for the granted role, one for the revoked role."""
    from common.audit.models import AuditLog
    admin = _user(org, "admin@a.com")
    _grant(admin, "org_admin")
    target = _user(org, "t@a.com")
    _grant(target, "employee")

    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    granted_before = AuditLog.objects.filter(action="user.role_granted").count()
    revoked_before = AuditLog.objects.filter(action="user.role_revoked").count()
    resp = client.patch(
        f"/api/v1/users/{target.id}/roles/",
        {"role_codes": ["manager"]},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert AuditLog.objects.filter(action="user.role_granted").count() == granted_before + 1
    assert AuditLog.objects.filter(action="user.role_revoked").count() == revoked_before + 1


@pytest.mark.django_db
def test_endpoint_target_not_found_returns_404(org):
    admin = _user(org, "admin@a.com")
    _grant(admin, "org_admin")
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.patch(
        "/api/v1/users/00000000-0000-0000-0000-000000000000/roles/",
        {"role_codes": ["manager"]},
        format="json",
    )
    assert resp.status_code == 404
```

- [ ] **Step 3: Run all admin tests**

```bash
cd apps/api && uv run pytest modules/identity/tests/test_roles_admin.py modules/identity/tests/test_user_roles_admin.py -v
```

Expected: all passed (~12-15 tests across the two files).

- [ ] **Step 4: Run the full backend suite — confirm no regressions**

```bash
cd apps/api && uv run pytest -q
```

Expected: all green, count rises from 468 baseline to ~480-490.

- [ ] **Step 5: Commit**

```bash
git add apps/api/modules/identity/tests/test_roles_admin.py \
        apps/api/modules/identity/tests/test_user_roles_admin.py
git commit -m "test(identity): end-to-end role admin endpoint tests + audit verification"
```

---

## Acceptance for Sub-plan A

- [ ] All 11 tasks committed.
- [ ] `pytest -q` (api) green; total count rises by 12-15 tests.
- [ ] `python manage.py check` clean.
- [ ] Curl against the running api container:
  ```bash
  TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@provintell.demo","password":"Demo!2026"}' \  # pragma: allowlist secret
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

  # List roles
  curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/roles/ | python3 -m json.tool | head

  # Get one role
  curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/roles/manager/

  # Try to PATCH org_admin to drop role:write — expect 400
  curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"permission_codes": ["employee:read:self"]}' \
    http://localhost:8000/api/v1/roles/org_admin/permissions/
  ```
  Expected status codes: 200, 200, 400.

When all green, move to Sub-plan B (feature flags backend).
