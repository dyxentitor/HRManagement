# HRMS M2b — Employee Finishers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close M2. Add the three specialized employee endpoints (`reporting-chain`, `direct-reports`, `probation-status`), wire `audit.append` into every Employee write, enforce fresh-MFA on bank-account changes (with an HR-notification email side-effect), ship a minimal frontend "My Profile" page, then merge to master and tag `v0.1.0-m2`.

**Architecture:**
- Specialized endpoints are `@action` methods on the existing `EmployeeViewSet`.
- Audit integration: a Django `post_save` signal on `Employee` reads the `before`/`after` field changes and writes one `audit.append` per consequential change. Use `update_fields` on the save call to detect what changed.
- Bank-change re-MFA: a serializer-level check that requires `X-MFA-Code` header when `bank_account_number` or `bank_name` are in the PATCH body; the code is verified via `mfa.verify_code_for_user`.
- Frontend: one page at `/me/profile` showing the user's employee profile (read-only first iteration; full edit form can land in M3 if needed).

**Tech Stack:** Same. No new deps.

**Branch:** `m2/employees` (current). Last commit: `fa9898b` (M2a-T4).

---

## Task 1: Specialized employee endpoints

**Files:**
- Modify: `apps/api/modules/employee/views.py` (add 3 `@action`s)
- Create: `apps/api/modules/employee/tests/test_specialized_endpoints.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/modules/employee/tests/test_specialized_endpoints.py`:

```python
"""Tests for /employees/{id}/{reporting-chain,direct-reports,probation-status}."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _emp(org, dept, code: str, manager: Employee | None = None, probation_end: datetime.date | None = None) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id, employee_code=code,
        first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept, manager=manager,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
        probation_end_date=probation_end,
    )


def _hr_client(org: Organization) -> APIClient:
    user = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    for code in ("employee:read:org", "employee:write:org"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    body = client.post("/api/v1/auth/login", {"email": "hr@x.com", "password": "x"}, format="json").json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client


@pytest.fixture
def org_and_chain():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    vp = _emp(org, dept, "VP", manager=ceo)
    mgr = _emp(org, dept, "MGR", manager=vp)
    emp = _emp(org, dept, "EMP", manager=mgr)
    return org, dept, (ceo, vp, mgr, emp)


@pytest.mark.django_db
def test_reporting_chain_walks_to_root(org_and_chain) -> None:
    org, _, (ceo, vp, mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{emp.id}/reporting-chain/")
    assert resp.status_code == 200
    body = resp.json()
    codes = [r["employee_code"] for r in body]
    assert codes == ["MGR", "VP", "CEO"]


@pytest.mark.django_db
def test_direct_reports(org_and_chain) -> None:
    org, _, (ceo, vp, mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{mgr.id}/direct-reports/")
    assert resp.status_code == 200
    body = resp.json()
    assert [r["employee_code"] for r in body] == ["EMP"]


@pytest.mark.django_db
def test_direct_reports_empty(org_and_chain) -> None:
    org, _, (_ceo, _vp, _mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{emp.id}/direct-reports/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_probation_status_active() -> None:
    org = Organization.objects.create(
        name="X", slug="x2", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    end = datetime.date.today() + datetime.timedelta(days=15)
    e = _emp(org, dept, "P1", probation_end=end)
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "in_probation"
    assert body["days_remaining"] == 15
    assert body["probation_end_date"] == end.isoformat()


@pytest.mark.django_db
def test_probation_status_no_probation_set() -> None:
    org = Organization.objects.create(
        name="X", slug="x3", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    e = _emp(org, dept, "C1")  # no probation_end_date
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["days_remaining"] is None


@pytest.mark.django_db
def test_probation_status_overdue() -> None:
    org = Organization.objects.create(
        name="X", slug="x4", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    end = datetime.date.today() - datetime.timedelta(days=5)
    e = _emp(org, dept, "P2", probation_end=end)
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "overdue_confirmation"
    assert body["days_remaining"] == -5
```

- [ ] **Step 2: Run failing tests, expect 404s**

```
cd apps/api && uv run pytest modules/employee/tests/test_specialized_endpoints.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Add the 3 actions to `EmployeeViewSet`**

Edit `apps/api/modules/employee/views.py`. Append inside `EmployeeViewSet`:

```python
import datetime

from rest_framework.decorators import action

# ... existing class body ...

    @action(detail=True, methods=["get"], url_path="reporting-chain")
    def reporting_chain(self, request, pk=None):
        emp = self.get_object()
        from modules.identity.services.org import OrgService
        chain = OrgService().get_reporting_chain(emp.id)
        ser = self.get_serializer(chain, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="direct-reports")
    def direct_reports(self, request, pk=None):
        emp = self.get_object()
        reports = Employee.objects.filter(manager=emp)
        ser = self.get_serializer(reports, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="probation-status")
    def probation_status(self, request, pk=None):
        emp = self.get_object()
        end = emp.probation_end_date
        if end is None:
            body = {"status": "confirmed", "days_remaining": None, "probation_end_date": None}
        else:
            today = datetime.date.today()
            delta = (end - today).days
            if delta > 0:
                status_str = "in_probation"
            elif delta == 0:
                status_str = "due_today"
            else:
                status_str = "overdue_confirmation"
            body = {
                "status": status_str,
                "days_remaining": delta,
                "probation_end_date": end.isoformat(),
            }
        return Response(body)
```

Update `get_required_perms()` to allow these actions:
```python
    def get_required_perms(self) -> list[str]:
        if self.action in ("list", "retrieve", "reporting_chain", "direct_reports", "probation_status"):
            return ["employee:read:org"]
        if self.action == "create":
            return ["employee:create"]
        if self.action in ("update", "partial_update"):
            return ["employee:write:org"]
        if self.action == "destroy":
            return ["employee:archive"]
        if self.action == "me":
            return ["employee:read:self"] if self.request.method == "GET" else ["employee:write:self"]
        return []
```

- [ ] **Step 4: Run tests, expect 6 PASS**

```
cd apps/api && uv run pytest modules/employee/tests/test_specialized_endpoints.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Regen contracts + commit**

```
sg docker -c 'make contracts' 2>&1 | tail -3
git add apps/api/modules/employee/ packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(employee): reporting-chain, direct-reports, probation-status endpoints"
```

---

## Task 2: Audit log integration on Employee writes

**Files:**
- Create: `apps/api/modules/employee/signals.py`
- Modify: `apps/api/modules/employee/apps.py` (call signals.ready())
- Create: `apps/api/modules/employee/tests/test_audit_integration.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/modules/employee/tests/test_audit_integration.py`:

```python
"""Tests that Employee writes append to the audit log."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from common.audit.models import AuditLog
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def org_dept():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    return org, dept


def _make(org, dept, **overrides):
    base = dict(
        org_id=org.id, employee_code="X", first_name="A", last_name="B",
        email="a@b.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    base.update(overrides)
    return Employee.all_objects.create(**base)


@pytest.mark.django_db
def test_employee_create_appends_audit(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A1")
    rows = AuditLog.objects.filter(entity="employees", entity_id=e.id, action="employee.created")
    assert rows.count() == 1


@pytest.mark.django_db
def test_employee_update_appends_audit_with_diff(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A2", role_title="Engineer")
    AuditLog.objects.all().delete()  # ignore the create row

    e.role_title = "Senior Engineer"
    e.save()

    row = AuditLog.objects.filter(entity_id=e.id, action="employee.updated").first()
    assert row is not None
    assert row.before["role_title"] == "Engineer"
    assert row.after["role_title"] == "Senior Engineer"


@pytest.mark.django_db
def test_employee_soft_delete_appends_audit(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A3")
    AuditLog.objects.all().delete()

    e.delete()

    row = AuditLog.objects.filter(entity_id=e.id, action="employee.archived").first()
    assert row is not None


@pytest.mark.django_db
def test_employee_unchanged_save_does_not_audit(org_dept) -> None:
    """If save() is called with no field changes, no audit row is written."""
    org, dept = org_dept
    e = _make(org, dept, employee_code="A4")
    AuditLog.objects.all().delete()

    e.save()  # no changes

    assert AuditLog.objects.filter(entity_id=e.id, action="employee.updated").count() == 0
```

- [ ] **Step 2: Implement `apps/api/modules/employee/signals.py`**

```python
"""Signals that emit audit-log rows on Employee changes."""
from __future__ import annotations

from typing import Any

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from common.audit import append
from .models import Employee


# Fields we care about for diffing on update.
TRACKED_FIELDS = (
    "first_name", "last_name", "preferred_name", "email", "phone", "alt_phone",
    "ic_last4", "address_line1", "address_line2", "city", "state", "postcode",
    "country_code", "department_id", "manager_id", "role_title", "employment_type",
    "schedule_type", "probation_end_date", "contract_end_date", "confirmed_at",
    "bank_name", "bank_account_last4",
    "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone",
    "status",
)


def _snapshot(instance: Employee) -> dict[str, Any]:
    return {f: getattr(instance, f) for f in TRACKED_FIELDS}


@receiver(pre_save, sender=Employee)
def _capture_pre_save_snapshot(sender, instance: Employee, **kwargs) -> None:
    """Stash the persisted state on the instance so post_save can diff."""
    if instance.pk is None:
        instance._pre_save_snapshot = None
        return
    try:
        existing = Employee.all_objects.get(pk=instance.pk)
        instance._pre_save_snapshot = _snapshot(existing)
    except Employee.DoesNotExist:
        instance._pre_save_snapshot = None


@receiver(post_save, sender=Employee)
def _audit_employee_save(sender, instance: Employee, created: bool, **kwargs) -> None:
    if created:
        append(
            org_id=instance.org_id,
            action="employee.created",
            entity="employees",
            entity_id=instance.id,
            before=None,
            after=_snapshot(instance),
        )
        return

    before = getattr(instance, "_pre_save_snapshot", None)
    after = _snapshot(instance)
    if before is None:
        return

    # Detect soft-delete: deleted_at went from None → not-None.
    pre_deleted = before.get("deleted_at") if isinstance(before, dict) and "deleted_at" in before else None
    if instance.deleted_at is not None and (pre_deleted is None):
        append(
            org_id=instance.org_id,
            action="employee.archived",
            entity="employees",
            entity_id=instance.id,
            before=before,
            after=after,
        )
        return

    # Diff tracked fields
    diff_before = {k: v for k, v in before.items() if before.get(k) != after.get(k)}
    diff_after = {k: v for k, v in after.items() if before.get(k) != after.get(k)}
    if not diff_before:
        return  # no tracked-field change

    append(
        org_id=instance.org_id,
        action="employee.updated",
        entity="employees",
        entity_id=instance.id,
        before=diff_before,
        after=diff_after,
    )
```

(Note: the `_pre_save_snapshot` doesn't include `deleted_at` because `deleted_at` isn't in TRACKED_FIELDS. To detect soft-delete properly, add `deleted_at` to the snapshot — easiest via expanding TRACKED_FIELDS for the pre-save side only. For simplicity, fix by also stashing `deleted_at`:)

Replace `_capture_pre_save_snapshot` to also capture `deleted_at`:

```python
@receiver(pre_save, sender=Employee)
def _capture_pre_save_snapshot(sender, instance: Employee, **kwargs) -> None:
    if instance.pk is None:
        instance._pre_save_snapshot = None
        return
    try:
        existing = Employee.all_objects.get(pk=instance.pk)
        snap = _snapshot(existing)
        snap["deleted_at"] = existing.deleted_at
        instance._pre_save_snapshot = snap
    except Employee.DoesNotExist:
        instance._pre_save_snapshot = None
```

- [ ] **Step 3: Wire signals via `ready()`**

Edit `apps/api/modules/employee/apps.py`:

```python
class EmployeeConfig(AppConfig):
    name = "modules.employee"
    label = "employee"
    verbose_name = "Employees"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
```

- [ ] **Step 4: Run tests, expect 4 PASS**

```
cd apps/api && uv run pytest modules/employee/tests/test_audit_integration.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Commit Task 2**

```
git add apps/api/modules/employee/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(employee): audit-log integration on create/update/archive via signals"
```

---

## Task 3: Bank-change re-MFA + HR notification

**Files:**
- Modify: `apps/api/modules/identity/services/mfa.py` (add `verify_code_for_user`)
- Modify: `apps/api/modules/employee/serializers.py` (re-MFA check on bank fields)
- Modify: `apps/api/modules/employee/services.py` (HR notification on bank change)
- Modify: `apps/api/modules/employee/views.py` (pass request.headers into serializer context)
- Create: `apps/api/modules/employee/tests/test_bank_change_mfa.py`

- [ ] **Step 1: Add `verify_code_for_user` to mfa service**

Edit `apps/api/modules/identity/services/mfa.py`. Append:

```python
def verify_code_for_user(user: "User", code: str) -> bool:
    """Verify a TOTP code against a user's confirmed MFA device.

    Returns True on success. Used by serializers / views that need to
    re-challenge for sensitive operations (bank change, role change).
    """
    device = MFADevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    if not device:
        return False
    if not pyotp.TOTP(device.secret).verify(code, valid_window=1):
        return False
    device.last_used_at = timezone.now()
    device.save(update_fields=["last_used_at"])
    return True
```

- [ ] **Step 2: Write failing tests**

Create `apps/api/modules/employee/tests/test_bank_change_mfa.py`:

```python
"""Bank field PATCHes via /me require fresh MFA."""
import datetime
import os

import pyotp
import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import (
    MFADevice,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id, mfa_enabled=True)  # pragma: allowlist secret
    secret = pyotp.random_base32()
    MFADevice.objects.create(user=user, secret=secret, confirmed_at=datetime.datetime.now(datetime.timezone.utc))
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in ("employee:read:self", "employee:write:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    emp = Employee.all_objects.create(
        org_id=org.id, user=user, employee_code="E1",
        first_name="A", last_name="B", email="emp@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="Engineer", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="OldBank",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )

    client = APIClient()

    # Login: receives mfa_required=true + mfa_token
    body = client.post("/api/v1/auth/login", {"email": "emp@x.com", "password": "x"}, format="json").json()  # pragma: allowlist secret
    # Complete MFA login step
    code = pyotp.TOTP(secret).now()
    body = client.post("/api/v1/auth/login/mfa", {"mfa_token": body["mfa_token"], "code": code}, format="json").json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client, user, secret, emp


@pytest.mark.django_db
def test_bank_patch_without_mfa_header_rejected(setup) -> None:
    client, _, _, _ = setup
    resp = client.patch("/api/v1/employees/me/", {"bank_name": "NewBank"}, format="json")
    assert resp.status_code == 400
    assert "mfa" in str(resp.content).lower()


@pytest.mark.django_db
def test_bank_patch_with_valid_mfa_header_accepted(setup) -> None:
    client, _, secret, emp = setup
    code = pyotp.TOTP(secret).now()
    resp = client.patch(
        "/api/v1/employees/me/",
        {"bank_name": "NewBank"},
        format="json",
        HTTP_X_MFA_CODE=code,
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.bank_name == "NewBank"


@pytest.mark.django_db
def test_bank_patch_with_invalid_mfa_header_rejected(setup) -> None:
    client, _, _, _ = setup
    resp = client.patch(
        "/api/v1/employees/me/",
        {"bank_name": "NewBank"},
        format="json",
        HTTP_X_MFA_CODE="000000",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_non_bank_patch_does_not_require_mfa(setup) -> None:
    client, _, _, emp = setup
    resp = client.patch("/api/v1/employees/me/", {"phone": "+60999"}, format="json")
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.phone == "+60999"
```

- [ ] **Step 3: Enforce re-MFA in the `/me` endpoint**

Edit `apps/api/modules/employee/views.py`. Find the `me` action and update the PATCH branch to check the MFA header before saving when bank fields are present:

```python
    BANK_FIELDS = frozenset({"bank_name", "bank_account_number"})

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request, *args, **kwargs):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            from rest_framework.exceptions import NotFound
            raise NotFound("No employee profile linked to this user.")

        if request.method == "GET":
            return Response(EmployeeMeSerializer(emp, context={"request": request}).data)

        # Re-MFA check on bank fields
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from modules.identity.services.mfa import verify_code_for_user
            from rest_framework.exceptions import ValidationError
            mfa_code = request.headers.get("X-MFA-Code", "")
            if not mfa_code:
                raise ValidationError({"mfa": "X-MFA-Code header required for bank field changes"})
            if not verify_code_for_user(request.user, mfa_code):
                raise ValidationError({"mfa": "Invalid MFA code"})

        ser = EmployeeMeSerializer(emp, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()

        # Recompute bank_account_last4 if bank_account_number was supplied
        if "bank_account_number" in request.data and request.data["bank_account_number"]:
            emp.bank_account_last4 = request.data["bank_account_number"][-4:]
            emp.save(update_fields=["bank_account_last4", "updated_at"])

        # Notify HR if any bank field changed
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from .services import EmployeeService
            EmployeeService.notify_hr_of_bank_change(emp)

        return Response(ser.data, status=200)
```

- [ ] **Step 4: Add `notify_hr_of_bank_change` to services**

Edit `apps/api/modules/employee/services.py`. Append:

```python
from django.conf import settings
from django.core.mail import send_mail


class EmployeeService:
    # ... existing methods ...

    @staticmethod
    def notify_hr_of_bank_change(emp: Employee) -> None:
        """Email an HR-distribution alias whenever an employee changes their bank info.

        In M2 this is fire-and-forget via send_mail (uses MailHog in dev).
        """
        recipient = getattr(settings, "HR_NOTIFICATION_EMAIL", "hr@provintell.local")
        send_mail(
            subject=f"[HRMS] Bank info changed by {emp.email}",
            message=(
                f"Employee {emp.first_name} {emp.last_name} ({emp.employee_code}) "
                f"changed their bank info via self-service.\n\n"
                f"Bank: {emp.bank_name}\n"
                f"Last4: {emp.bank_account_last4}\n"
                f"Time: {emp.updated_at.isoformat()}"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=True,  # email failures must not block the API call
        )
```

- [ ] **Step 5: Run tests, expect 4 PASS**

```
cd apps/api && uv run pytest modules/employee/tests/test_bank_change_mfa.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 6: Commit Task 3**

```
git add apps/api/modules/identity/services/mfa.py apps/api/modules/employee/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(employee): bank-change requires fresh MFA + HR notification email"
```

---

## Task 4: Frontend My Profile page + M2 milestone close

**Files:**
- Create: `apps/web/src/modules/employee/pages/MyProfilePage.tsx`
- Create: `apps/web/src/modules/employee/routes.tsx`
- Create: `apps/web/src/modules/employee/api.ts`
- Modify: `apps/web/src/App.tsx` (mount the new route)
- Modify: `apps/web/src/components/shell/TopBar.tsx` (add nav link)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Frontend module — API + page**

`apps/web/src/modules/employee/api.ts`:

```typescript
import { api } from "@/lib/api"

export const employeeApi = {
  getMe: async () => {
    const { data, error } = await api.GET("/api/v1/employees/me/" as any)
    if (error) throw new Error("Could not load profile")
    return data
  },
}
```

`apps/web/src/modules/employee/pages/MyProfilePage.tsx`:

```tsx
import { useEffect, useState } from "react"

import { employeeApi } from "../api"

interface EmployeeProfile {
  employee_code: string
  full_name: string
  email: string
  phone: string
  alt_phone: string
  preferred_name: string
  role_title: string
  employment_type: string
  hire_date: string
  status: string
  department: string
  bank_name: string
  bank_account_last4: string
  ic_last4: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
}

export default function MyProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await employeeApi.getMe()
        if (!cancelled) setProfile(data as unknown as EmployeeProfile)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p>Loading...</p>
  if (error) return <p role="alert" className="text-red-600">{error}</p>
  if (!profile) return <p>No profile linked to this user.</p>

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <Section title="Identity">
        <Row label="Name" value={profile.full_name} />
        <Row label="Code" value={profile.employee_code} />
        <Row label="Email" value={profile.email} />
        <Row label="Phone" value={profile.phone} />
      </Section>

      <Section title="Employment">
        <Row label="Role" value={profile.role_title} />
        <Row label="Type" value={profile.employment_type} />
        <Row label="Status" value={profile.status} />
        <Row label="Hire date" value={profile.hire_date} />
      </Section>

      <Section title="Sensitive (read-only here)">
        <Row label="IC last 4" value={profile.ic_last4 || "—"} />
        <Row label="Bank" value={profile.bank_name || "—"} />
        <Row label="Bank last 4" value={profile.bank_account_last4 || "—"} />
      </Section>

      <Section title="Emergency contact">
        <Row label="Name" value={profile.emergency_contact_name} />
        <Row label="Relationship" value={profile.emergency_contact_relationship} />
        <Row label="Phone" value={profile.emergency_contact_phone} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded p-4 bg-white">
      <h2 className="font-semibold mb-3">{title}</h2>
      <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">{children}</dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd>{value || "—"}</dd>
    </>
  )
}
```

`apps/web/src/modules/employee/routes.tsx`:

```tsx
import { lazy } from "react"
import type { RouteObject } from "react-router-dom"

const MyProfilePage = lazy(() => import("./pages/MyProfilePage"))

export const employeeRoutes: RouteObject[] = [
  { path: "/me/profile", element: <MyProfilePage /> },
]
```

- [ ] **Step 2: Mount routes + add TopBar link**

Edit `apps/web/src/App.tsx`. Import `employeeRoutes` and add them as children of the AppShell route:

```tsx
import { employeeRoutes } from "./modules/employee/routes"

const router = createBrowserRouter([
  ...authRoutes,
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Suspense fallback={null}><HomePage /></Suspense> },
      ...employeeRoutes.map((r) => ({
        ...r,
        path: r.path?.replace(/^\//, ""),  // strip leading slash for nested route
        element: <Suspense fallback={null}>{r.element}</Suspense>,
      })),
    ],
  },
])
```

Edit `apps/web/src/components/shell/TopBar.tsx`. Add a nav link before the user-email span:

```tsx
import { Link } from "react-router-dom"

// ... inside the right-side div, before the email span:
<Link to="/me/profile" className="text-slate-600 hover:text-slate-900">
  My Profile
</Link>
```

- [ ] **Step 3: Run frontend test + build**

```
cd apps/web && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5; cd ../..
```
Expected: existing 4 tests still pass; build succeeds with bundle gz still < 250 KB.

- [ ] **Step 4: Commit Task 4 (frontend)**

```
git add apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): MyProfilePage shows employee profile details"
```

- [ ] **Step 5: Update CHANGELOG**

Edit `CHANGELOG.md`. Add the M2 release block:

```markdown
## [Unreleased]

## [0.1.0-m2] - 2026-04-28

### Added
- **M2a — Employee Core:** Tier 2 `Employee` model with encrypted IC/bank/LHDN/EPF/SOCSO/EIS, manager self-FK with cycle protection, `OrgService` rewired to consult real Employees, `Department.head_employee_id` FK constraint on Postgres. CRUD viewset + `/api/v1/employees/me` self-edit (whitelist enforces phone/address/emergency-contact only; `role_title`/`employee_code` read-only on `/me`).
- **M2b — Finishers:** `/employees/{id}/{reporting-chain,direct-reports,probation-status}` endpoints. Audit-log integration via Django signals (employee.created/updated/archived with field-level diff). Bank-change requires fresh MFA via `X-MFA-Code` header + HR notification email. Frontend MyProfilePage at `/me/profile` displays employee profile.

### Changed
- Default role bundles extended with `employee:*` codes per spec §5.
- Permission catalogue grew from 18 (M1b) to 29 codes.
```

- [ ] **Step 6: Commit milestone-close + tag**

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M2 milestone complete — release 0.1.0-m2"
git tag -a v0.1.0-m2 -m "M2: Employee directory (Tier 2) — backend + minimal frontend my-profile"
```

- [ ] **Step 7: Merge to master**

```
git checkout master
git merge --ff-only m2/employees
git branch -d m2/employees
```

Verify:
```
git log --oneline -3
git tag -l "v*"
cd apps/api && uv run pytest -q 2>&1 | tail -5; cd ../..
cd apps/web && pnpm test 2>&1 | tail -5; cd ../..
```
Expected: master at the M2 tag commit, tags `v0.1.0-m0`, `v0.1.0-m1`, `v0.1.0-m2` all present, all tests green.

---

## M2b + M2 Acceptance Criteria

- [ ] `/employees/{id}/reporting-chain/` returns the manager chain to root
- [ ] `/employees/{id}/direct-reports/` returns immediate reports (empty list for ICs)
- [ ] `/employees/{id}/probation-status/` returns `{status, days_remaining, probation_end_date}` with status ∈ {`confirmed`, `in_probation`, `due_today`, `overdue_confirmation`}
- [ ] Every Employee write appends to `audit_log` (create / update with diff / archive)
- [ ] PATCH `/employees/me` with bank fields requires `X-MFA-Code: <totp>` header
- [ ] Invalid MFA code → 400; missing header → 400; non-bank PATCH → no MFA needed
- [ ] HR receives an email when an employee self-edits bank info
- [ ] `/me/profile` page renders the user's profile cleanly
- [ ] All backend + frontend tests green
- [ ] `make contracts` regenerated with new endpoints
- [ ] Pre-commit clean
- [ ] `m2/employees` merged to master, tag `v0.1.0-m2` exists on master HEAD

That closes M2.
