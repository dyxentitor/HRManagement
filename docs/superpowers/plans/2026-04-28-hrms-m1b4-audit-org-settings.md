# HRMS M1b-4 — Audit Log + Payroll Ledger + Org Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final M1b chunk. (1) Tier-1 audit log model + middleware-driven actor capture + helper API; (2) cryptographically chained `payroll_audit_ledger` table created with append-only DB trigger (table empty in M1, real writes start in M6); (3) org settings GET/PATCH endpoints. After this plan, every consequential action funnels through `audit.append(...)` and `audit:read:org`-permitted users can see the entries via the admin or future viewset.

**Architecture:** `audit` is a sub-package of `common/` (cross-cutting). Middleware captures `actor_id`/`ip`/`user_agent` into a thread-local; `audit.append` reads from that thread-local. Hash chain on `payroll_audit_ledger`: each row's `row_hash = sha256(prev_hash || canonical_payload || actor_id || ts)`; the chain head is implicit (max(seq)). DB trigger on `payroll_audit_ledger` raises on UPDATE/DELETE.

**Tech Stack:** Django + Postgres trigger (raw SQL in a migration). No new deps.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (audit_log, payroll_audit_ledger), §6 (audit log usage in event flows).

**Branch:** `m1/identity-rbac` (current).

---

## File structure

```
apps/api/
├── common/
│   ├── audit/                                  ← NEW package
│   │   ├── __init__.py                         (re-exports `append`, `verify_payroll_chain`)
│   │   ├── models.py                           ← AuditLog, PayrollAuditLedger
│   │   ├── middleware.py                       ← AuditContextMiddleware (actor + ip + ua thread-local)
│   │   ├── service.py                          ← append, verify_payroll_chain
│   │   ├── apps.py
│   │   ├── migrations/
│   │   │   ├── __init__.py
│   │   │   ├── 0001_initial.py                 (auto-generated)
│   │   │   └── 0002_payroll_ledger_trigger.py  (raw SQL CREATE TRIGGER)
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_models.py
│   │       ├── test_service.py
│   │       └── test_payroll_chain.py
└── modules/
    └── organization/
        ├── views.py                            ← + OrgSettingsView (GET/PATCH)
        ├── urls.py                             ← + /org/settings
        ├── tests/test_org_settings.py          ← NEW
        └── ...
```

---

## Task 1: Audit log model + middleware + service

**Files:**
- Create: `apps/api/common/audit/__init__.py`
- Create: `apps/api/common/audit/apps.py`
- Create: `apps/api/common/audit/models.py`
- Create: `apps/api/common/audit/middleware.py`
- Create: `apps/api/common/audit/service.py`
- Create: `apps/api/common/audit/migrations/__init__.py`
- Create: `apps/api/common/audit/tests/__init__.py`
- Create: `apps/api/common/audit/tests/test_models.py`
- Create: `apps/api/common/audit/tests/test_service.py`
- Modify: `apps/api/hrms_api/settings/base.py` (register `common.audit`, add middleware)

- [ ] **Step 1: Create the package skeleton**

```
mkdir -p apps/api/common/audit/{tests,migrations}
touch apps/api/common/audit/__init__.py \
      apps/api/common/audit/migrations/__init__.py \
      apps/api/common/audit/tests/__init__.py
```

- [ ] **Step 2: Create `apps.py`**

```python
# apps/api/common/audit/apps.py
from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "common.audit"
    label = "audit"
    verbose_name = "Audit log"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Write failing model + service tests first**

Create `apps/api/common/audit/tests/test_models.py`:

```python
"""AuditLog and PayrollAuditLedger model basics."""
import uuid

import pytest

from common.audit.models import AuditLog, PayrollAuditLedger


@pytest.mark.django_db
def test_auditlog_minimal_fields() -> None:
    org_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    row = AuditLog.objects.create(
        org_id=org_id,
        actor_id=None,
        action="leave.request.approve",
        entity="leave_requests",
        entity_id=entity_id,
        before={"status": "submitted"},
        after={"status": "approved"},
    )
    assert row.id is not None
    assert row.org_id == org_id
    assert row.before["status"] == "submitted"


@pytest.mark.django_db
def test_payroll_ledger_seq_assigned_on_insert() -> None:
    org_id = uuid.uuid4()
    row = PayrollAuditLedger.objects.create(
        org_id=org_id,
        actor_id=None,
        action="employee.salary.update",
        entity="employees",
        entity_id=uuid.uuid4(),
        payload={"before": {"salary": 1000}, "after": {"salary": 1100}},
        prev_hash="0" * 64,
        row_hash="a" * 64,
    )
    assert row.seq is not None
    assert row.seq >= 1
```

Create `apps/api/common/audit/tests/test_service.py`:

```python
"""audit.append + middleware-captured actor/ip/ua thread-local."""
import uuid
from unittest.mock import Mock

import pytest
from django.test import RequestFactory

from common.audit import append
from common.audit.middleware import AuditContextMiddleware
from common.audit.models import AuditLog
from modules.identity.models import User


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="auditor@example.com", password="x", org_id=org_id  # pragma: allowlist secret
    )


@pytest.mark.django_db
def test_append_writes_audit_row(user: User) -> None:
    """Without middleware context, actor is None but the row still writes."""
    entity_id = uuid.uuid4()
    append(
        org_id=user.org_id,
        action="user.password.change",
        entity="users",
        entity_id=entity_id,
        before={"hash": "old"},
        after={"hash": "new"},
    )
    rows = AuditLog.objects.filter(entity_id=entity_id)
    assert rows.count() == 1
    assert rows[0].action == "user.password.change"
    assert rows[0].actor_id is None


@pytest.mark.django_db
def test_middleware_captures_actor_in_audit_row(rf: RequestFactory, user: User) -> None:
    """When the middleware is active, append picks up actor_id/ip/user_agent automatically."""
    captured = {}

    def get_response(request):
        # Inside the request lifecycle, `append` should see the actor
        entity_id = uuid.uuid4()
        captured["entity_id"] = entity_id
        append(
            org_id=user.org_id,
            action="something",
            entity="things",
            entity_id=entity_id,
            before=None,
            after={"x": 1},
        )
        return Mock()

    middleware = AuditContextMiddleware(get_response)
    request = rf.get("/foo", HTTP_USER_AGENT="pytest-ua")
    request.user = user
    request.META["REMOTE_ADDR"] = "10.0.0.1"
    middleware(request)

    row = AuditLog.objects.get(entity_id=captured["entity_id"])
    assert row.actor_id == user.id
    assert row.ip == "10.0.0.1"
    assert row.user_agent == "pytest-ua"
```

- [ ] **Step 4: Run failing tests, expect ImportError**

```
cd apps/api && uv run pytest common/audit/tests/ -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Implement `apps/api/common/audit/models.py`**

```python
"""Audit log models — one tier-1 log + one append-only chained payroll ledger."""
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    """Tier-1 audit log per spec §3 / Q17 lock.

    Captures consequential actions (leave/claim/KPI submits & approvals,
    role grants, salary/bank/IC/tax changes — wherever a service emits
    `audit.append(...)`).
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    ts = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "audit_log"
        indexes = [
            models.Index(fields=["org_id", "-ts"], name="audit_log_org_ts"),
            models.Index(fields=["entity", "entity_id", "-ts"], name="audit_log_entity_ts"),
            models.Index(fields=["actor_id", "-ts"], name="audit_log_actor_ts"),
        ]


class PayrollAuditLedger(models.Model):
    """Append-only, hash-chained ledger for salary / bank / IC / tax / payroll changes.

    A DB trigger (added in 0002 migration) raises on UPDATE/DELETE so this table
    is genuinely append-only — even via the ORM. The hash chain is recomputed
    on demand via `audit.verify_payroll_chain()`.

    M1: created but unused. M6 (Payroll) starts writing to it.
    """

    seq = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    payload = models.JSONField()
    prev_hash = models.CharField(max_length=64)
    row_hash = models.CharField(max_length=64)
    ts = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "payroll_audit_ledger"
        indexes = [
            models.Index(fields=["org_id", "seq"], name="payroll_ledger_org_seq"),
        ]
```

- [ ] **Step 6: Implement `apps/api/common/audit/middleware.py`**

```python
"""AuditContextMiddleware — captures actor + ip + user_agent into thread-local for the request scope."""
from __future__ import annotations

import threading
import uuid
from typing import Callable

_local = threading.local()


def get_current_actor_id() -> uuid.UUID | None:
    return getattr(_local, "actor_id", None)


def get_current_ip() -> str | None:
    return getattr(_local, "ip", None)


def get_current_user_agent() -> str | None:
    return getattr(_local, "user_agent", None)


def set_audit_context(actor_id: uuid.UUID | None, ip: str | None, ua: str | None) -> None:
    _local.actor_id = actor_id
    _local.ip = ip
    _local.user_agent = ua


def clear_audit_context() -> None:
    _local.actor_id = None
    _local.ip = None
    _local.user_agent = None


class AuditContextMiddleware:
    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        actor_id = getattr(user, "id", None) if (user and getattr(user, "is_authenticated", False)) else None

        fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip = fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")

        ua = request.META.get("HTTP_USER_AGENT", "")[:1024]

        set_audit_context(actor_id, ip, ua)
        try:
            return self.get_response(request)
        finally:
            clear_audit_context()
```

- [ ] **Step 7: Implement `apps/api/common/audit/service.py` and `__init__.py`**

`apps/api/common/audit/service.py`:

```python
"""audit.append + payroll-ledger helpers."""
from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from django.db import transaction
from django.utils import timezone

from .middleware import (
    get_current_actor_id,
    get_current_ip,
    get_current_user_agent,
)
from .models import AuditLog, PayrollAuditLedger

GENESIS_HASH = "0" * 64


def append(
    *,
    org_id: uuid.UUID,
    action: str,
    entity: str,
    entity_id: uuid.UUID,
    before: dict | None = None,
    after: dict | None = None,
    actor_id: uuid.UUID | None = None,
) -> AuditLog:
    """Write a single Tier-1 audit-log row.

    Actor / ip / user_agent are pulled from the AuditContext middleware unless
    overridden by `actor_id`. `before` and `after` are stored as JSONB.
    """
    return AuditLog.objects.create(
        org_id=org_id,
        actor_id=actor_id if actor_id is not None else get_current_actor_id(),
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
        ip=get_current_ip(),
        user_agent=get_current_user_agent(),
    )


def _canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def append_payroll(
    *,
    org_id: uuid.UUID,
    action: str,
    entity: str,
    entity_id: uuid.UUID,
    payload: dict,
    actor_id: uuid.UUID | None = None,
) -> PayrollAuditLedger:
    """Write to the chained payroll ledger. Computes prev_hash + row_hash atomically.

    M1: stays unused. M6 (Payroll) wires this up alongside payslip publish.
    """
    actor = actor_id if actor_id is not None else get_current_actor_id()
    with transaction.atomic():
        last = PayrollAuditLedger.objects.order_by("-seq").first()
        prev_hash = last.row_hash if last else GENESIS_HASH

        ts = timezone.now()
        material = (
            prev_hash
            + _canonical(payload)
            + (str(actor) if actor else "")
            + ts.isoformat()
        ).encode("utf-8")
        row_hash = hashlib.sha256(material).hexdigest()

        return PayrollAuditLedger.objects.create(
            org_id=org_id,
            actor_id=actor,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload,
            prev_hash=prev_hash,
            row_hash=row_hash,
            ts=ts,
        )


def verify_payroll_chain() -> tuple[bool, int | None]:
    """Recompute hashes from genesis to head. Returns (verified, broken_at_seq_or_None)."""
    prev = GENESIS_HASH
    for row in PayrollAuditLedger.objects.order_by("seq"):
        material = (
            prev
            + _canonical(row.payload)
            + (str(row.actor_id) if row.actor_id else "")
            + row.ts.isoformat()
        ).encode("utf-8")
        expected = hashlib.sha256(material).hexdigest()
        if expected != row.row_hash:
            return False, row.seq
        prev = row.row_hash
    return True, None
```

`apps/api/common/audit/__init__.py`:

```python
from .service import append, append_payroll, verify_payroll_chain

__all__ = ["append", "append_payroll", "verify_payroll_chain"]
```

- [ ] **Step 8: Register the app + middleware**

Edit `apps/api/hrms_api/settings/base.py`. Add `"common.audit"` to `INSTALLED_APPS` (after `"common"` is sufficient — order doesn't matter for non-app-registry concerns):

```python
    "common",
    "common.audit",
    "modules.health",
    "modules.organization",
    "modules.identity",
    "rest_framework_simplejwt.token_blacklist",
```

Append `"common.audit.middleware.AuditContextMiddleware"` to `MIDDLEWARE`:

```python
MIDDLEWARE += [
    "modules.identity.middleware.TenantContextMiddleware",
    "common.audit.middleware.AuditContextMiddleware",
]
```

(or insert in the existing MIDDLEWARE list after TenantContextMiddleware).

- [ ] **Step 9: Generate migration + run tests**

```
cd apps/api && uv run python manage.py makemigrations audit 2>&1 | tail -5 && uv run pytest common/audit/tests/test_models.py common/audit/tests/test_service.py -v 2>&1 | tail -15; cd ../..
```
Expected: `0001_initial.py` creates `audit_log` and `payroll_audit_ledger` tables. 4 tests pass (2 model + 2 service).

- [ ] **Step 10: Commit Task 1**

```
git add apps/api/common/audit/ apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(audit): AuditLog + PayrollAuditLedger models, AuditContext middleware, append helper"
```

---

## Task 2: Append-only DB trigger on `payroll_audit_ledger`

**Files:**
- Create: `apps/api/common/audit/migrations/0002_payroll_ledger_append_only.py`
- Create: `apps/api/common/audit/tests/test_payroll_chain.py`

- [ ] **Step 1: Write failing tests for the trigger + chain verification**

Create `apps/api/common/audit/tests/test_payroll_chain.py`:

```python
"""Tests for the append-only DB trigger and hash-chain verification."""
import uuid

import pytest
from django.db import IntegrityError, ProgrammingError, transaction

from common.audit import append_payroll, verify_payroll_chain
from common.audit.models import PayrollAuditLedger


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_append_payroll_creates_chained_rows(org_id: uuid.UUID) -> None:
    r1 = append_payroll(
        org_id=org_id, action="employee.salary.update",
        entity="employees", entity_id=uuid.uuid4(),
        payload={"before": {"salary": 1000}, "after": {"salary": 1100}},
    )
    r2 = append_payroll(
        org_id=org_id, action="employee.salary.update",
        entity="employees", entity_id=uuid.uuid4(),
        payload={"before": {"salary": 2000}, "after": {"salary": 2100}},
    )
    assert r2.prev_hash == r1.row_hash
    assert r1.row_hash != r2.row_hash


@pytest.mark.django_db
def test_verify_chain_true_when_intact(org_id: uuid.UUID) -> None:
    for i in range(3):
        append_payroll(
            org_id=org_id, action=f"act.{i}",
            entity="x", entity_id=uuid.uuid4(),
            payload={"i": i},
        )
    ok, broken_at = verify_payroll_chain()
    assert ok is True
    assert broken_at is None


@pytest.mark.django_db(transaction=True)
def test_db_trigger_blocks_update(org_id: uuid.UUID) -> None:
    """An UPDATE on payroll_audit_ledger must raise (db trigger)."""
    row = append_payroll(
        org_id=org_id, action="x",
        entity="x", entity_id=uuid.uuid4(),
        payload={"k": "v"},
    )
    with pytest.raises((IntegrityError, ProgrammingError, Exception)):
        with transaction.atomic():
            PayrollAuditLedger.objects.filter(seq=row.seq).update(action="tampered")


@pytest.mark.django_db(transaction=True)
def test_db_trigger_blocks_delete(org_id: uuid.UUID) -> None:
    row = append_payroll(
        org_id=org_id, action="x",
        entity="x", entity_id=uuid.uuid4(),
        payload={"k": "v"},
    )
    with pytest.raises((IntegrityError, ProgrammingError, Exception)):
        with transaction.atomic():
            PayrollAuditLedger.objects.filter(seq=row.seq).delete()
```

- [ ] **Step 2: Implement the trigger migration**

Create `apps/api/common/audit/migrations/0002_payroll_ledger_append_only.py`:

```python
"""Postgres trigger making payroll_audit_ledger append-only at the DB level.

The trigger fires BEFORE UPDATE OR DELETE and raises an exception. This is
defense in depth on top of the application-layer rule that nobody calls .save()
or .delete() on PayrollAuditLedger except the audit service's append_payroll().
"""
from django.db import migrations


SQL_UP = """
CREATE OR REPLACE FUNCTION payroll_ledger_block_modify() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'payroll_audit_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_ledger_block_update ON payroll_audit_ledger;
DROP TRIGGER IF EXISTS payroll_ledger_block_delete ON payroll_audit_ledger;

CREATE TRIGGER payroll_ledger_block_update
    BEFORE UPDATE ON payroll_audit_ledger
    FOR EACH ROW EXECUTE FUNCTION payroll_ledger_block_modify();

CREATE TRIGGER payroll_ledger_block_delete
    BEFORE DELETE ON payroll_audit_ledger
    FOR EACH ROW EXECUTE FUNCTION payroll_ledger_block_modify();
"""

SQL_DOWN = """
DROP TRIGGER IF EXISTS payroll_ledger_block_update ON payroll_audit_ledger;
DROP TRIGGER IF EXISTS payroll_ledger_block_delete ON payroll_audit_ledger;
DROP FUNCTION IF EXISTS payroll_ledger_block_modify();
"""


class Migration(migrations.Migration):

    dependencies = [("audit", "0001_initial")]

    operations = [
        migrations.RunSQL(sql=SQL_UP, reverse_sql=SQL_DOWN),
    ]
```

- [ ] **Step 3: Run trigger tests**

The trigger only exists on Postgres (not sqlite). The test settings use sqlite, so the trigger tests would skip or fail.

Two options:
- **Option A (recommended):** mark these tests as `@pytest.mark.skipif(connection.vendor != "postgresql", reason="trigger is postgres-only")` — they only run when CI has Postgres available, which our docker-compose tests do via `docker compose run --rm api pytest`.
- **Option B:** add the same trigger via a sqlite-compatible RunPython that uses `CREATE TRIGGER` (sqlite supports BEFORE UPDATE / BEFORE DELETE triggers with RAISE).

Use Option A — keeping the migration Postgres-only is cleaner. Edit each trigger-related test:

```python
import pytest
from django.db import connection

requires_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="DB trigger is postgres-only; sqlite test runs skip"
)


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_db_trigger_blocks_update(org_id: uuid.UUID) -> None:
    ...
```

- [ ] **Step 4: Run tests**

```
cd apps/api && uv run pytest common/audit/tests/test_payroll_chain.py -v 2>&1 | tail -10; cd ../..
```
Expected (sqlite environment): 2 chain-verification tests pass; 2 trigger tests skip.

To exercise the trigger in postgres, run inside the api container later:
```
sg docker -c 'docker compose -f deploy/docker-compose.yml run --rm api uv run pytest common/audit/tests/test_payroll_chain.py -v' 2>&1 | tail -15
```
Expected: all 4 tests pass when run against the postgres-backed compose stack.

- [ ] **Step 5: Commit Task 2**

```
git add apps/api/common/audit/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(audit): postgres trigger blocks UPDATE/DELETE on payroll_audit_ledger"
```

---

## Task 3: Org settings endpoints

**Files:**
- Modify: `apps/api/modules/organization/serializers.py` (OrgSettingsSerializer)
- Modify: `apps/api/modules/organization/views.py` (OrgSettingsView)
- Modify: `apps/api/modules/organization/urls.py`
- Create: `apps/api/modules/organization/tests/test_org_settings.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/modules/organization/tests/test_org_settings.py`:

```python
"""Tests for /api/v1/org/settings GET/PATCH."""
import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell", slug="provintell", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _setup_user(org: Organization, perm_codes: list[str]) -> tuple[APIClient, User]:
    user = User.objects.create_user(email="u@example.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="org_admin", name="Org Admin", is_system=True)
    for code in perm_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "u@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client, user


@pytest.mark.django_db
def test_get_org_settings_authenticated(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "provintell"
    assert body["country_code"] == "MY"


@pytest.mark.django_db
def test_get_org_settings_denied_without_perm(org: Organization) -> None:
    client, _ = _setup_user(org, [])  # no perms
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_patch_org_settings_with_write_perm(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read", "org:settings:write"])
    resp = client.patch(
        "/api/v1/org/settings",
        {"settings": {"theme": "dark"}},
        format="json",
    )
    assert resp.status_code == 200
    org.refresh_from_db()
    assert org.settings == {"theme": "dark"}


@pytest.mark.django_db
def test_patch_org_settings_denied_with_only_read(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])
    resp = client.patch(
        "/api/v1/org/settings",
        {"settings": {"theme": "dark"}},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_get_org_settings_unauthenticated() -> None:
    Organization.objects.create(
        name="X", slug="x", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    client = APIClient()
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest modules/organization/tests/test_org_settings.py -v 2>&1 | tail -10; cd ../..
```
Expected: 404s on the endpoint.

- [ ] **Step 3: Add `OrgSettingsSerializer` to `serializers.py`**

Append:

```python
class OrgSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "id", "name", "slug", "country_code", "default_currency",
            "default_timezone", "default_locale", "settings", "status",
        )
        read_only_fields = ("id", "slug", "status")
```

- [ ] **Step 4: Add `OrgSettingsView` to `views.py`**

Append:

```python
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import RetrieveModelMixin, UpdateModelMixin

from .serializers import OrgSettingsSerializer


class OrgSettingsView(RetrieveModelMixin, UpdateModelMixin, GenericAPIView):
    """GET/PATCH the current user's organization settings."""

    serializer_class = OrgSettingsSerializer
    permission_classes = [HRMSPermission]

    def get_object(self):
        return Organization.objects.get(id=self.request.user.org_id)

    @property
    def required_perms(self):
        return ["org:settings:read"] if self.request.method == "GET" else ["org:settings:write"]

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)
```

- [ ] **Step 5: Register URL**

Edit `apps/api/modules/organization/urls.py`. Add:

```python
from .views import OrgSettingsView

urlpatterns += [
    path("org/settings", OrgSettingsView.as_view(), name="org-settings"),
]
```

- [ ] **Step 6: Run tests**

```
cd apps/api && uv run pytest modules/organization/tests/test_org_settings.py -v 2>&1 | tail -10; cd ../..
```
Expected: 5 tests pass.

- [ ] **Step 7: Final M1b-4 test run + contracts regen**

```
cd apps/api && uv run pytest common/ modules/identity/ modules/organization/ -v 2>&1 | tail -10; cd ../..
sg docker -c 'make contracts' 2>&1 | tail -3
```
Expected: ~100 tests pass.

- [ ] **Step 8: Commit Task 3**

```
git add apps/api/modules/organization/ packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(organization): /org/settings GET/PATCH endpoints with RBAC"
```

---

## M1b-4 Acceptance Criteria

- [ ] `audit_log` and `payroll_audit_ledger` tables exist (migrations applied)
- [ ] `from common.audit import append, append_payroll, verify_payroll_chain` works
- [ ] `append(...)` writes a row; if called inside a request, actor/ip/ua are populated automatically by `AuditContextMiddleware`
- [ ] `append_payroll(...)` chains rows by hash; `verify_payroll_chain()` returns `(True, None)` when intact
- [ ] DB trigger blocks UPDATE/DELETE on `payroll_audit_ledger` (postgres-only test path)
- [ ] `GET /api/v1/org/settings` returns the user's org info; requires `org:settings:read`
- [ ] `PATCH /api/v1/org/settings` updates org settings; requires `org:settings:write`
- [ ] All M1b tests green
- [ ] Contracts regenerated
- [ ] Pre-commit clean

That is M1b-4 — and M1 backend is done. Next plan: **M1c — Frontend Auth** (AuthContext, login screen, useCan, RouteGuard, app shell, E2E).
