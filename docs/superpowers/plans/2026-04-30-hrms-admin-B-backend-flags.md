# HRMS Admin Tools — Sub-plan B: Feature Flags Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `common/feature_flags/` subpackage; `@requires_feature` decorator wired on all 10 togglable ViewSets; `/api/v1/org/feature-flags/` endpoints work.

**Architecture:** A new Django app (`common.feature_flags`) with model, registry constants, service (with dependency cascade + Redis cache), class-level `@requires_feature(key)` decorator that wraps `dispatch()`, and two endpoints. Each module's ViewSet gets decorated; backwards-compatibility default = enabled when no row exists.

**Tech Stack:** Django 5 · DRF · django-redis · pytest.

**Spec reference:** `docs/superpowers/specs/2026-04-30-hrms-admin-tools.md` §1 (architecture), §4 (Feature 3 — schema, registry, service, decorator, endpoints).

**Pre-requisite:** Sub-plan A (backend role admin) must be complete.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/common/feature_flags/__init__.py` | App marker |
| Create | `apps/api/common/feature_flags/apps.py` | `FeatureFlagsConfig` |
| Create | `apps/api/common/feature_flags/models.py` | `FeatureFlag` model |
| Create | `apps/api/common/feature_flags/migrations/0001_initial.py` | Initial migration |
| Create | `apps/api/common/feature_flags/registry.py` | `TOGGLABLE_MODULES` / `CRITICAL_MODULES` / `DERIVED_MODULES` |
| Create | `apps/api/common/feature_flags/cache.py` | Redis 60s TTL helpers |
| Create | `apps/api/common/feature_flags/services.py` | `is_enabled` (with cascade) + `set_enabled` (with critical guard) + `list_for_org` |
| Create | `apps/api/common/feature_flags/exceptions.py` | `CriticalModuleError`, `UnknownModuleKey` |
| Create | `apps/api/common/feature_flags/decorators.py` | `@requires_feature(key)` class decorator |
| Create | `apps/api/common/feature_flags/serializers.py` | `FeatureFlagSerializer`, `FeatureFlagInputSerializer` |
| Create | `apps/api/common/feature_flags/views.py` | `feature_flags_list_view`, `feature_flag_patch_view` |
| Create | `apps/api/common/feature_flags/urls.py` | URL patterns |
| Create | `apps/api/common/feature_flags/tests/test_services.py` | Service-layer tests |
| Create | `apps/api/common/feature_flags/tests/test_decorator.py` | Decorator tests |
| Create | `apps/api/common/feature_flags/tests/test_endpoints.py` | API tests |
| Modify | `apps/api/hrms_api/settings/base.py` | Add `common.feature_flags` to `INSTALLED_APPS` |
| Modify | `apps/api/hrms_api/urls.py` | Mount `feature_flags.urls` under `/api/v1/org/` |
| Modify | each module's `views.py` (10 modules) | Apply `@requires_feature("<key>")` to ViewSets |

---

## Task 1: New Django app skeleton + `FeatureFlag` model + migration

**Files:**
- Create: `apps/api/common/feature_flags/__init__.py` (empty)
- Create: `apps/api/common/feature_flags/apps.py`
- Create: `apps/api/common/feature_flags/models.py`
- Create: `apps/api/common/feature_flags/registry.py`
- Modify: `apps/api/hrms_api/settings/base.py`

- [ ] **Step 1: Create the package layout**

```bash
mkdir -p apps/api/common/feature_flags/migrations apps/api/common/feature_flags/tests
touch apps/api/common/feature_flags/__init__.py
touch apps/api/common/feature_flags/migrations/__init__.py
touch apps/api/common/feature_flags/tests/__init__.py
```

- [ ] **Step 2: `apps.py`**

Create `apps/api/common/feature_flags/apps.py`:

```python
from django.apps import AppConfig


class FeatureFlagsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "common.feature_flags"
    label = "feature_flags"
```

- [ ] **Step 3: `registry.py`**

Create `apps/api/common/feature_flags/registry.py`:

```python
"""Single source of truth for what's a togglable module.

Used by both the backend (services, decorator) and frontend (via the
GET /api/v1/org/feature-flags/ endpoint which returns this list joined
with the FeatureFlag rows).
"""

from __future__ import annotations

# 10 admin-togglable modules with optional dependencies.
# `depends_on` means: if any dep is disabled, this module's effective
# state is disabled too (cascade).
TOGGLABLE_MODULES: dict[str, dict] = {
    "leave":         {"label": "Leave", "depends_on": []},
    "schedule":      {"label": "Schedule", "depends_on": []},
    "attendance":    {"label": "Attendance", "depends_on": ["schedule"]},
    "claims":        {"label": "Claims", "depends_on": []},
    "payslip":       {"label": "Payslips", "depends_on": []},
    "kpi":           {"label": "KPI", "depends_on": []},
    "certification": {"label": "Certifications", "depends_on": []},
    "training":      {"label": "Training", "depends_on": ["certification"]},
    "reports":       {"label": "Reports", "depends_on": []},
    "notifications": {"label": "Notifications", "depends_on": []},
}

# Always-on. Disabling = system lockout. is_enabled() short-circuits
# to True for these regardless of DB state.
CRITICAL_MODULES: set[str] = {"identity", "employee", "organization"}

# Derived (informational). Effective state is computed from any of the
# referenced togglable modules being enabled.
DERIVED_MODULES: dict[str, dict] = {
    "dashboard": {
        "label": "Dashboard",
        "depends_on_any": ["leave", "schedule", "attendance", "claims", "kpi", "certification"],
    },
    "approvals": {
        "label": "Approvals",
        "depends_on_any": ["leave", "claims", "kpi"],
    },
}
```

- [ ] **Step 4: `models.py`**

Create `apps/api/common/feature_flags/models.py`:

```python
import uuid

from django.db import models


class FeatureFlag(models.Model):
    """Per-org module enable/disable. Absent row = enabled by default."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    key = models.CharField(max_length=64)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "feature_flags"
        unique_together = [("org_id", "key")]
        indexes = [models.Index(fields=["org_id", "key"])]

    def __str__(self) -> str:
        return f"{self.key}@{self.org_id}={'on' if self.enabled else 'off'}"
```

- [ ] **Step 5: Add to `INSTALLED_APPS`**

Edit `apps/api/hrms_api/settings/base.py`. Find the `# Local` section in `INSTALLED_APPS` and add `"common.feature_flags",` after the existing `"common.workflow",` entry:

```python
INSTALLED_APPS = [
    # ... django + third-party ...
    # Local
    "common",
    "common.audit",
    "common.workflow",
    "common.feature_flags",   # NEW
    "common.reporting",
    # ... module apps ...
]
```

- [ ] **Step 6: Generate the migration**

```bash
cd apps/api && uv run python manage.py makemigrations feature_flags
```

Expected: creates `apps/api/common/feature_flags/migrations/0001_initial.py` with the FeatureFlag model.

- [ ] **Step 7: Apply the migration**

```bash
cd apps/api && uv run python manage.py migrate feature_flags
```

Expected: applies `feature_flags.0001_initial`.

- [ ] **Step 8: Verify the app loads**

```bash
cd apps/api && uv run python manage.py check
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/common/feature_flags/__init__.py \
        apps/api/common/feature_flags/apps.py \
        apps/api/common/feature_flags/models.py \
        apps/api/common/feature_flags/registry.py \
        apps/api/common/feature_flags/migrations/ \
        apps/api/common/feature_flags/tests/__init__.py \
        apps/api/hrms_api/settings/base.py
git commit -m "feat(feature_flags): app skeleton + FeatureFlag model + registry"
```

---

## Task 2: Cache helpers + service layer (TDD)

**Files:**
- Create: `apps/api/common/feature_flags/cache.py`
- Create: `apps/api/common/feature_flags/exceptions.py`
- Create: `apps/api/common/feature_flags/services.py`
- Create: `apps/api/common/feature_flags/tests/test_services.py`

- [ ] **Step 1: `exceptions.py`**

Create `apps/api/common/feature_flags/exceptions.py`:

```python
class CriticalModuleError(Exception):
    """Raised when an admin tries to disable a critical module."""


class UnknownModuleKey(Exception):
    """Raised when set_enabled is called with a key not in the registry."""
```

- [ ] **Step 2: `cache.py`**

Create `apps/api/common/feature_flags/cache.py`:

```python
"""Redis cache for feature-flag lookups. 60s TTL, key ff:{org_id}:{key}."""

from __future__ import annotations

from uuid import UUID

from django.core.cache import cache

TTL_SECONDS = 60


def _key(org_id: UUID, module_key: str) -> str:
    return f"ff:{org_id}:{module_key}"


def get(org_id: UUID, module_key: str) -> bool | None:
    """Returns True/False if cached, None if not cached."""
    val = cache.get(_key(org_id, module_key))
    if val is None:
        return None
    return val == "1"


def set_(org_id: UUID, module_key: str, enabled: bool) -> None:
    cache.set(_key(org_id, module_key), "1" if enabled else "0", TTL_SECONDS)


def invalidate(org_id: UUID, module_key: str) -> None:
    cache.delete(_key(org_id, module_key))
```

(Uses Django's `cache` framework which is already wired to Redis per `settings/base.py` `CACHES` config.)

- [ ] **Step 3: Write the failing tests**

Create `apps/api/common/feature_flags/tests/test_services.py`:

```python
"""Service-layer tests for feature flags."""

import pytest

from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKey
from common.feature_flags.models import FeatureFlag
from common.feature_flags.services import is_enabled, list_for_org, set_enabled
from modules.identity.models import User
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X", slug="x", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def actor(org):
    return User.objects.create_user(email="a@x.com", password="x", org_id=org.id)  # pragma: allowlist secret


@pytest.mark.django_db
def test_is_enabled_default_true_when_no_row(org):
    assert is_enabled(org.id, "claims") is True


@pytest.mark.django_db
def test_is_enabled_respects_db_row(org, actor):
    set_enabled(org.id, "claims", False, actor=actor)
    assert is_enabled(org.id, "claims") is False
    set_enabled(org.id, "claims", True, actor=actor)
    assert is_enabled(org.id, "claims") is True


@pytest.mark.django_db
def test_critical_module_always_enabled_even_if_db_says_false(org):
    """Manually insert a disabled row for `identity` — must still report True."""
    FeatureFlag.objects.create(org_id=org.id, key="identity", enabled=False)
    assert is_enabled(org.id, "identity") is True


@pytest.mark.django_db
def test_dependency_cascade(org, actor):
    """Disabling `schedule` makes `attendance` effectively disabled."""
    set_enabled(org.id, "schedule", False, actor=actor)
    assert is_enabled(org.id, "schedule") is False
    assert is_enabled(org.id, "attendance") is False  # cascade


@pytest.mark.django_db
def test_set_enabled_rejects_critical(org, actor):
    with pytest.raises(CriticalModuleError):
        set_enabled(org.id, "identity", False, actor=actor)


@pytest.mark.django_db
def test_set_enabled_rejects_unknown_key(org, actor):
    with pytest.raises(UnknownModuleKey):
        set_enabled(org.id, "ceo_module", False, actor=actor)


@pytest.mark.django_db
def test_set_enabled_writes_audit(org, actor):
    from common.audit.models import AuditLog
    initial = AuditLog.objects.filter(action="feature_flag.changed").count()
    set_enabled(org.id, "claims", False, actor=actor)
    assert AuditLog.objects.filter(action="feature_flag.changed").count() == initial + 1


@pytest.mark.django_db
def test_list_for_org_returns_15_entries(org, actor):
    """10 togglable + 3 critical + 2 derived."""
    set_enabled(org.id, "claims", False, actor=actor)
    entries = list_for_org(org.id)
    assert len(entries) == 15
    by_key = {e["key"]: e for e in entries}
    assert by_key["claims"]["enabled"] is False
    assert by_key["identity"]["critical"] is True
    assert by_key["identity"]["enabled"] is True
    assert by_key["dashboard"]["derived"] is True
    assert by_key["leave"]["enabled"] is True  # default
```

- [ ] **Step 4: Run tests — expect 7 ImportError-style failures**

```bash
cd apps/api && uv run pytest common/feature_flags/tests/test_services.py -v
```

Expected: ImportError because `services.py` doesn't exist yet.

- [ ] **Step 5: Write `services.py`**

Create `apps/api/common/feature_flags/services.py`:

```python
"""Feature-flag business logic.

is_enabled(org_id, key)         -> effective enabled (with cascade)
set_enabled(org_id, key, bool)  -> updates DB + cache + audit
list_for_org(org_id)            -> registry joined with org's rows
"""

from __future__ import annotations

from uuid import UUID

from django.db import transaction

from common.feature_flags import cache as cache_helpers
from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKey
from common.feature_flags.models import FeatureFlag
from common.feature_flags.registry import (
    CRITICAL_MODULES,
    DERIVED_MODULES,
    TOGGLABLE_MODULES,
)


def _is_own_enabled(org_id: UUID, key: str) -> bool:
    """The DB-and-cache layer. Doesn't apply cascade or critical-override."""
    cached = cache_helpers.get(org_id, key)
    if cached is not None:
        return cached
    flag = FeatureFlag.objects.filter(org_id=org_id, key=key).first()
    enabled = flag.enabled if flag else True  # default-enabled when row absent
    cache_helpers.set_(org_id, key, enabled)
    return enabled


def is_enabled(org_id: UUID, key: str) -> bool:
    """Effective enabled state for a module key.

    - Critical modules always return True (defense in depth).
    - Togglable modules return False if their own row says False
      OR if any of their `depends_on` modules is disabled.
    - Derived modules return True if any of their `depends_on_any`
      modules is enabled.
    - Unknown keys default to True (best-effort) — but normally
      consumers should only pass known keys.
    """
    if key in CRITICAL_MODULES:
        return True

    if key in TOGGLABLE_MODULES:
        if not _is_own_enabled(org_id, key):
            return False
        for dep in TOGGLABLE_MODULES[key]["depends_on"]:
            if not is_enabled(org_id, dep):
                return False
        return True

    if key in DERIVED_MODULES:
        return any(
            is_enabled(org_id, dep)
            for dep in DERIVED_MODULES[key]["depends_on_any"]
        )

    return True  # unknown — fail open


def set_enabled(org_id: UUID, key: str, enabled: bool, *, actor) -> FeatureFlag:
    """Persist the enabled state. Refuses critical disables."""
    from common.audit import services as audit

    if key in CRITICAL_MODULES and not enabled:
        raise CriticalModuleError(f"Cannot disable critical module '{key}'")

    if key not in TOGGLABLE_MODULES and key not in CRITICAL_MODULES:
        # Derived modules are read-only; unknown keys are rejected.
        raise UnknownModuleKey(f"Unknown module key '{key}'")

    with transaction.atomic():
        flag, created = FeatureFlag.objects.update_or_create(
            org_id=org_id,
            key=key,
            defaults={"enabled": enabled, "updated_by": actor},
        )
        cache_helpers.invalidate(org_id, key)
        # Also invalidate any module that depends on this one
        for dep_key, dep_meta in TOGGLABLE_MODULES.items():
            if key in dep_meta["depends_on"]:
                cache_helpers.invalidate(org_id, dep_key)

    audit.append(
        "feature_flag.changed",
        actor=actor,
        payload={"key": key, "enabled": enabled, "created": created},
    )
    return flag


def list_for_org(org_id: UUID) -> list[dict]:
    """Returns all 15 entries (10 togglable + 3 critical + 2 derived)
    joined with current state for the org."""
    rows = {
        f.key: f for f in FeatureFlag.objects.filter(org_id=org_id)
    }
    out = []

    for key, meta in TOGGLABLE_MODULES.items():
        out.append({
            "key": key,
            "label": meta["label"],
            "enabled": is_enabled(org_id, key),
            "togglable": True,
            "critical": False,
            "derived": False,
            "depends_on": meta["depends_on"],
        })

    for key in sorted(CRITICAL_MODULES):
        out.append({
            "key": key,
            "label": key.title(),
            "enabled": True,
            "togglable": False,
            "critical": True,
            "derived": False,
            "depends_on": [],
        })

    for key, meta in DERIVED_MODULES.items():
        out.append({
            "key": key,
            "label": meta["label"],
            "enabled": is_enabled(org_id, key),
            "togglable": False,
            "critical": False,
            "derived": True,
            "depends_on_any": meta["depends_on_any"],
        })

    return out
```

- [ ] **Step 6: Run tests — expect all passing**

```bash
cd apps/api && uv run pytest common/feature_flags/tests/test_services.py -v
```

Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/common/feature_flags/cache.py \
        apps/api/common/feature_flags/exceptions.py \
        apps/api/common/feature_flags/services.py \
        apps/api/common/feature_flags/tests/test_services.py
git commit -m "feat(feature_flags): is_enabled with cascade + set_enabled + list_for_org"
```

---

## Task 3: `@requires_feature` decorator (TDD)

**Files:**
- Create: `apps/api/common/feature_flags/decorators.py`
- Create: `apps/api/common/feature_flags/tests/test_decorator.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/common/feature_flags/tests/test_decorator.py`:

```python
"""Tests for @requires_feature(key) class decorator."""

import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.viewsets import ViewSet

from common.feature_flags.decorators import requires_feature
from common.feature_flags.models import FeatureFlag
from modules.identity.models import User
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X", slug="x", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def user(org):
    return User.objects.create_user(email="u@x.com", password="x", org_id=org.id)  # pragma: allowlist secret


@requires_feature("claims")
class _DummyClaimsViewSet(ViewSet):
    def list(self, request):
        return Response({"ok": True})


@requires_feature("identity")
class _DummyIdentityViewSet(ViewSet):
    def list(self, request):
        return Response({"ok": True})


def _call_list(viewset_cls, user):
    factory = APIRequestFactory()
    request = factory.get("/dummy/")
    force_authenticate(request, user=user)
    view = viewset_cls.as_view({"get": "list"})
    return view(request)


@pytest.mark.django_db
def test_decorator_passes_when_module_enabled(user):
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 200


@pytest.mark.django_db
def test_decorator_blocks_when_module_disabled(org, user):
    FeatureFlag.objects.create(org_id=org.id, key="claims", enabled=False)
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 403
    assert "claims" in resp.data["detail"].lower()


@pytest.mark.django_db
def test_decorator_passes_for_critical_even_if_db_says_false(org, user):
    """Defense in depth: identity is critical and stays on regardless of DB."""
    FeatureFlag.objects.create(org_id=org.id, key="identity", enabled=False)
    resp = _call_list(_DummyIdentityViewSet, user)
    assert resp.status_code == 200


@pytest.mark.django_db
def test_decorator_invalidates_cache_when_flag_flips(org, user):
    """If we flip via set_enabled (which invalidates the cache), the next request reflects it."""
    from common.feature_flags.services import set_enabled
    # Initially enabled
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 200
    set_enabled(org.id, "claims", False, actor=user)
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests — expect ImportError**

```bash
cd apps/api && uv run pytest common/feature_flags/tests/test_decorator.py -v
```

- [ ] **Step 3: Write `decorators.py`**

Create `apps/api/common/feature_flags/decorators.py`:

```python
"""@requires_feature(key) class decorator.

Wraps the ViewSet's dispatch() to short-circuit with 403 when the key
is disabled for the request user's org. Critical modules pass through.
Runs BEFORE the existing HRMSPermission check.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

from common.feature_flags.services import is_enabled


def requires_feature(key: str):
    def wrap(cls):
        original_dispatch = cls.dispatch

        def dispatch(self, request, *args, **kwargs):
            # Authentication may not have run yet at dispatch start;
            # call initialize_request to populate request.user.
            self.request = self.initialize_request(request, *args, **kwargs)
            self.headers = self.default_response_headers
            try:
                self.initial(self.request, *args, **kwargs)
            except Exception:  # noqa: BLE001
                # Let DRF handle auth failures normally — short-circuit only
                # when we have a real user and the module is off.
                return original_dispatch(self, request, *args, **kwargs)

            user = getattr(self.request, "user", None)
            org_id = getattr(user, "org_id", None) if user else None

            if org_id and not is_enabled(org_id, key):
                response = Response(
                    {"detail": f"Module '{key}' is disabled for this organisation"},
                    status=status.HTTP_403_FORBIDDEN,
                )
                response.accepted_renderer = self.request.accepted_renderer
                response.accepted_media_type = self.request.accepted_media_type
                response.renderer_context = self.get_renderer_context()
                return response

            return original_dispatch(self, request, *args, **kwargs)

        cls.dispatch = dispatch
        return cls
    return wrap
```

(The decorator's `initial()` early-call is to get authentication wired so we can read `request.user.org_id`. If auth fails, we fall back to the original dispatch, which will produce the standard 401 response.)

- [ ] **Step 4: Run — expect all passing**

```bash
cd apps/api && uv run pytest common/feature_flags/tests/test_decorator.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/common/feature_flags/decorators.py \
        apps/api/common/feature_flags/tests/test_decorator.py
git commit -m "feat(feature_flags): @requires_feature class decorator with critical pass-through"
```

---

## Task 4: API endpoints

**Files:**
- Create: `apps/api/common/feature_flags/serializers.py`
- Create: `apps/api/common/feature_flags/views.py`
- Create: `apps/api/common/feature_flags/urls.py`
- Modify: `apps/api/hrms_api/urls.py`

- [ ] **Step 1: `serializers.py`**

Create `apps/api/common/feature_flags/serializers.py`:

```python
from rest_framework import serializers


class FeatureFlagSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    enabled = serializers.BooleanField()
    togglable = serializers.BooleanField()
    critical = serializers.BooleanField()
    derived = serializers.BooleanField()
    depends_on = serializers.ListField(child=serializers.CharField(), required=False)
    depends_on_any = serializers.ListField(child=serializers.CharField(), required=False)


class FeatureFlagInputSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
```

- [ ] **Step 2: `views.py`**

Create `apps/api/common/feature_flags/views.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKey
from common.feature_flags.serializers import (
    FeatureFlagInputSerializer,
    FeatureFlagSerializer,
)
from common.feature_flags.services import list_for_org, set_enabled
from modules.identity.permissions import HRMSPermission


def _has_perm(user, code: str) -> bool:
    perms = HRMSPermission()
    return code in {p for p in perms.user_perms(user)}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feature_flags_list_view(request):
    """GET /api/v1/org/feature-flags/ — list all 15 entries with state."""
    if not _has_perm(request.user, "org:feature_flag:read"):
        return Response({"detail": "Permission denied"}, status=403)
    entries = list_for_org(request.user.org_id)
    return Response(FeatureFlagSerializer(entries, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def feature_flag_patch_view(request, key: str):
    """PATCH /api/v1/org/feature-flags/{key}/ — toggle enabled."""
    if not _has_perm(request.user, "org:feature_flag:write"):
        return Response({"detail": "Permission denied"}, status=403)

    serializer = FeatureFlagInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    enabled = serializer.validated_data["enabled"]

    try:
        set_enabled(request.user.org_id, key, enabled, actor=request.user)
    except CriticalModuleError as exc:
        return Response({"detail": str(exc)}, status=400)
    except UnknownModuleKey as exc:
        return Response({"detail": str(exc)}, status=400)

    # Return the full list so the client can refresh state in one round-trip
    entries = list_for_org(request.user.org_id)
    return Response(FeatureFlagSerializer(entries, many=True).data)
```

(Adapt the `_has_perm` helper to match your existing pattern. The goal is "user has the named perm".)

- [ ] **Step 3: `urls.py`**

Create `apps/api/common/feature_flags/urls.py`:

```python
from django.urls import path

from common.feature_flags.views import (
    feature_flag_patch_view,
    feature_flags_list_view,
)

urlpatterns = [
    path("feature-flags/", feature_flags_list_view, name="feature-flag-list"),
    path("feature-flags/<str:key>/", feature_flag_patch_view, name="feature-flag-patch"),
]
```

- [ ] **Step 4: Mount in the project URL conf**

Edit `apps/api/hrms_api/urls.py`. Find the `urlpatterns` block where module URLs are included. Add the feature_flags include under an `/api/v1/org/` prefix:

```python
path("api/v1/org/", include("common.feature_flags.urls")),
```

(If `/api/v1/org/` isn't yet a thing, this adds it. If `/api/v1/org/settings/` already exists from a different module, just add the feature_flags include alongside whatever's there. Verify by reading the current `urls.py` first.)

- [ ] **Step 5: Verify routes resolve**

```bash
cd apps/api && uv run python manage.py shell -c "from django.urls import reverse; print(reverse('feature-flag-list'))"
```

Expected: prints `/api/v1/org/feature-flags/`.

- [ ] **Step 6: Write endpoint tests**

Create `apps/api/common/feature_flags/tests/test_endpoints.py`:

```python
"""End-to-end tests for the feature-flag API endpoints."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.identity.models import Role, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X", slug="x", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture(autouse=True)
def seed(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


@pytest.fixture
def admin(org):
    u = User.objects.create_user(email="admin@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    UserRole.objects.create(user=u, role=Role.objects.get(org_id=org.id, code="org_admin"))
    return u


def _login(client, email):
    resp = client.post("/api/v1/auth/login", {"email": email, "password": "x"}, format="json")
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_list_returns_15_entries(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.get("/api/v1/org/feature-flags/")
    assert resp.status_code == 200
    assert len(resp.json()) == 15


@pytest.mark.django_db
def test_patch_toggles_module(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 200
    by_key = {e["key"]: e for e in resp.json()}
    assert by_key["claims"]["enabled"] is False


@pytest.mark.django_db
def test_patch_critical_rejected(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/identity/", {"enabled": False}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_employee_cannot_patch(org):
    """Employee role lacks org:feature_flag:write — must 403."""
    emp = User.objects.create_user(email="e@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    UserRole.objects.create(user=emp, role=Role.objects.get(org_id=org.id, code="employee"))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'e@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 403
```

- [ ] **Step 7: Run all feature-flag tests**

```bash
cd apps/api && uv run pytest common/feature_flags/ -v
```

Expected: ~16 passed (8 services + 4 decorator + 4 endpoints).

- [ ] **Step 8: Commit**

```bash
git add apps/api/common/feature_flags/serializers.py \
        apps/api/common/feature_flags/views.py \
        apps/api/common/feature_flags/urls.py \
        apps/api/common/feature_flags/tests/test_endpoints.py \
        apps/api/hrms_api/urls.py
git commit -m "feat(feature_flags): /api/v1/org/feature-flags/ list + patch endpoints"
```

---

## Task 5-9: Apply `@requires_feature` to all 10 togglable ViewSets

Each task is the same shape: open the module's `views.py`, decorate the relevant ViewSet(s), commit.

For each module below, find every ViewSet class (look for `class ...ViewSet(...):`) and decorate it. The decorator goes immediately above the class definition.

### Task 5: Leave + Schedule + Attendance

- [ ] **Step 1: Decorate leave ViewSets**

In `apps/api/modules/leave/views.py`, add the import at top:

```python
from common.feature_flags.decorators import requires_feature
```

Then decorate each ViewSet class:

```python
@requires_feature("leave")
class LeaveTypeViewSet(viewsets.ModelViewSet):
    ...

@requires_feature("leave")
class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    ...

@requires_feature("leave")
class LeaveRequestViewSet(viewsets.ModelViewSet):
    ...
```

(If a "list of viewsets" structure already exists, decorate each.)

- [ ] **Step 2: Decorate schedule ViewSets**

In `apps/api/modules/schedule/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("schedule")
class WorkScheduleViewSet(viewsets.ModelViewSet): ...

@requires_feature("schedule")
class ShiftViewSet(viewsets.ModelViewSet): ...

@requires_feature("schedule")
class ShiftAssignmentViewSet(viewsets.ModelViewSet): ...

@requires_feature("schedule")
class HolidayViewSet(viewsets.ModelViewSet): ...
```

- [ ] **Step 3: Decorate attendance ViewSets**

In `apps/api/modules/attendance/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("attendance")
class AttendanceViewSet(viewsets.ViewSet): ...
```

(If attendance uses function-based views, you'll need to convert to a ViewSet OR add a function decorator variant. Check the actual structure first.)

- [ ] **Step 4: Run tests**

```bash
cd apps/api && uv run pytest modules/leave modules/schedule modules/attendance -q
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/modules/leave/views.py \
        apps/api/modules/schedule/views.py \
        apps/api/modules/attendance/views.py
git commit -m "feat(feature_flags): apply @requires_feature to leave + schedule + attendance"
```

### Task 6: Claims + Payslip

- [ ] **Step 1: Decorate claims ViewSets**

In `apps/api/modules/claims/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("claims")
class ClaimRequestViewSet(viewsets.ModelViewSet): ...

@requires_feature("claims")
class ClaimCategoryViewSet(viewsets.ModelViewSet): ...

@requires_feature("claims")
class ClaimPolicyViewSet(viewsets.ModelViewSet): ...
```

- [ ] **Step 2: Decorate payslip ViewSets**

In `apps/api/modules/payslip/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("payslip")
class PayslipViewSet(viewsets.ReadOnlyModelViewSet): ...

@requires_feature("payslip")
class PayrollPeriodViewSet(viewsets.ModelViewSet): ...

@requires_feature("payslip")
class PayrollRunViewSet(viewsets.ModelViewSet): ...
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && uv run pytest modules/claims modules/payslip -q
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/claims/views.py apps/api/modules/payslip/views.py
git commit -m "feat(feature_flags): apply @requires_feature to claims + payslip"
```

### Task 7: KPI + Certification + Training

- [ ] **Step 1: Decorate KPI ViewSets**

In `apps/api/modules/kpi/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("kpi")
class KpiTemplateViewSet(...): ...

@requires_feature("kpi")
class KpiCycleViewSet(...): ...

@requires_feature("kpi")
class KpiAssignmentViewSet(...): ...

@requires_feature("kpi")
class KpiReviewViewSet(...): ...
```

- [ ] **Step 2: Decorate certification + training ViewSets**

In `apps/api/modules/certification/views.py`. Note that certification + training share a module — decorate them with their respective keys:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("certification")
class CertificationViewSet(...): ...

@requires_feature("training")
class TrainingPlanViewSet(...): ...

@requires_feature("training")
class TrainingAssignmentViewSet(...): ...
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && uv run pytest modules/kpi modules/certification -q
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/kpi/views.py apps/api/modules/certification/views.py
git commit -m "feat(feature_flags): apply @requires_feature to kpi + certification + training"
```

### Task 8: Reports + Notifications

- [ ] **Step 1: Decorate reports ViewSets**

In `apps/api/modules/reports/views.py` (and / or `apps/api/common/reporting/views.py` — check both):

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("reports")
class ReportViewSet(...): ...

@requires_feature("reports")
class SavedViewViewSet(...): ...

@requires_feature("reports")
class ReportExportJobViewSet(...): ...
```

- [ ] **Step 2: Decorate notifications ViewSets**

In `apps/api/modules/notification/views.py`:

```python
from common.feature_flags.decorators import requires_feature

@requires_feature("notifications")
class NotificationViewSet(...): ...

@requires_feature("notifications")
class NotificationPreferenceViewSet(...): ...

@requires_feature("notifications")
class EmailDigestRunViewSet(...): ...
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && uv run pytest modules/reports modules/notification common/reporting -q
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/modules/reports/views.py \
        apps/api/modules/notification/views.py \
        apps/api/common/reporting/views.py
git commit -m "feat(feature_flags): apply @requires_feature to reports + notifications"
```

---

## Task 9: End-to-end smoke test through the full stack

**Files:**
- Create: `apps/api/common/feature_flags/tests/test_e2e.py`

- [ ] **Step 1: Write the e2e test**

Create `apps/api/common/feature_flags/tests/test_e2e.py`:

```python
"""End-to-end: PATCH the feature-flag, hit a module endpoint, expect 403,
then re-enable, expect 200."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.identity.models import Role, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X", slug="x", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture(autouse=True)
def seed(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _admin(org):
    u = User.objects.create_user(email="admin@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    UserRole.objects.create(user=u, role=Role.objects.get(org_id=org.id, code="org_admin"))
    return u


def _login(client, email="admin@x.com"):
    resp = client.post("/api/v1/auth/login", {"email": email, "password": "x"}, format="json")
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_disable_module_then_endpoint_returns_403(org):
    _admin(org)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client)}")

    # Sanity: claims list is reachable
    resp = client.get("/api/v1/claims/")
    assert resp.status_code in (200, 403, 404)  # depends on data; just not 500
    initial_status = resp.status_code

    # Disable claims module
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 200

    # Now claims list should 403 with our specific detail message
    resp = client.get("/api/v1/claims/")
    assert resp.status_code == 403
    assert "claims" in resp.json()["detail"].lower()
    assert "disabled" in resp.json()["detail"].lower()

    # Re-enable
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": True}, format="json")
    assert resp.status_code == 200

    # Recovery: claims list reachable again with the original status
    resp = client.get("/api/v1/claims/")
    assert resp.status_code == initial_status
```

- [ ] **Step 2: Run**

```bash
cd apps/api && uv run pytest common/feature_flags/tests/test_e2e.py -v
```

Expected: 1 passed.

- [ ] **Step 3: Run the full backend suite**

```bash
cd apps/api && uv run pytest -q
```

Expected: all green; total count ~510 (468 baseline + ~12 from sub-plan A + ~17 from sub-plan B).

- [ ] **Step 4: Commit**

```bash
git add apps/api/common/feature_flags/tests/test_e2e.py
git commit -m "test(feature_flags): e2e disable+endpoint+recover"
```

---

## Acceptance for Sub-plan B

- [ ] All 9 tasks committed.
- [ ] `pytest -q` (api) green; total count ~510.
- [ ] `python manage.py check` clean.
- [ ] Curl smoke (with the api container restarted to pick up the new code):
  ```bash
  TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@provintell.demo","password":"Demo!2026"}' \  # pragma: allowlist secret
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

  # List flags
  curl -sf -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/v1/org/feature-flags/ | python3 -m json.tool | head -30

  # Disable claims
  curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"enabled": false}' \
    http://localhost:8000/api/v1/org/feature-flags/claims/ > /dev/null

  # Hit claims — expect 403
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/v1/claims/

  # Re-enable
  curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"enabled": true}' \
    http://localhost:8000/api/v1/org/feature-flags/claims/ > /dev/null
  ```
  Expected output: 403 (then claims is back to its normal status after re-enable).

When all green, move to Sub-plan C (frontend admin pages).
