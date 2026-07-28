"""Task 3: leave.replacement_granted notification fires on new grant only.

§3.15: real Employee row + linked User. Never reuse User.id as employee_id.
"""

from __future__ import annotations

import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


# ---------------------------------------------------------------------------
# Encryption key fixture (Employee has EncryptedCharField fields)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


# ---------------------------------------------------------------------------
# Shared org / dept fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="NotifyCo",
        slug="notifyco",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Ops")


# ---------------------------------------------------------------------------
# make_employee_with_user factory (§3.15 pattern)
# ---------------------------------------------------------------------------


@pytest.fixture
def make_employee_with_user(org: Organization, dept: Department):
    """Return a factory that creates an Employee backed by a real User."""
    _counter = [0]

    def _make(**overrides) -> Employee:
        _counter[0] += 1
        n = _counter[0]
        user = User.objects.create_user(
            email=f"emp{n}@notifyco.com",
            password="x",  # pragma: allowlist secret
            org_id=org.id,
        )
        defaults = dict(
            org_id=org.id,
            employee_code=f"E-{n:04d}",
            first_name="Alice",
            last_name=f"Emp{n}",
            email=f"emp{n}@notifyco.com",
            department=dept,
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            user=user,
        )
        defaults.update(overrides)
        return Employee.all_objects.create(**defaults)

    return _make


# ---------------------------------------------------------------------------
# make_leave_type factory
# ---------------------------------------------------------------------------


@pytest.fixture
def make_leave_type(org: Organization):
    """Return a factory that creates a LeaveType in the given org."""
    _counter = [0]

    def _make(org_id=None, code="ANNUAL", **overrides) -> LeaveType:
        _counter[0] += 1
        oid = org_id or org.id
        defaults = dict(
            org_id=oid,
            code=code,
            name=f"Leave {code}",
            accrual_type="annual",
            default_days=Decimal("14"),
            is_paid=True,
        )
        defaults.update(overrides)
        return LeaveType.all_objects.create(**defaults)

    return _make


# ===========================================================================
# Tests
# ===========================================================================


@pytest.mark.django_db
def test_replacement_grant_notifies_employee_once(make_employee_with_user, make_leave_type):
    """New grant fires leave.replacement_granted; idempotent replay does NOT fire again."""
    emp = make_employee_with_user()
    lt = make_leave_type(org_id=emp.org_id, code="ANNUAL")
    ref = uuid.uuid4()
    kwargs = dict(
        org_id=emp.org_id,
        employee_id=emp.id,
        leave_type=lt,
        year=2026,
        days=Decimal("1"),
        reference_type="manual",
        reference_id=ref,
    )

    # First call: new grant → notification created
    BalanceService.grant_replacement(**kwargs)
    assert Notification.objects.filter(
        type="leave.replacement_granted", user=emp.user
    ).exists(), "Expected a leave.replacement_granted notification on first grant"

    # Idempotent replay: same reference → NO second notification
    Notification.objects.all().delete()
    BalanceService.grant_replacement(**kwargs)
    assert not Notification.objects.filter(
        type="leave.replacement_granted"
    ).exists(), "Expected NO notification on idempotent replay (same reference_id)"
