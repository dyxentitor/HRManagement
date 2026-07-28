"""Tests for the tenure-ending scan service.

Fixtures follow §3.15: real Employee row + linked User + hr_manager-role User
in the same org. Never reuse User.id as employee_id.
"""

from __future__ import annotations

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from django.utils import timezone

from modules.employee.models import Employee
from modules.employee.services.tenure_scan import scan_tenure_endings
from modules.identity.models import Role, User, UserRole
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


# ---------------------------------------------------------------------------
# Encryption key (required for Employee model fields via EncryptedCharField)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


# ---------------------------------------------------------------------------
# Shared org/dept fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="TenureCo",
        slug="tenureco",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


# ---------------------------------------------------------------------------
# hr_manager_user fixture — a real User holding the hr_manager role in the org
# ---------------------------------------------------------------------------


@pytest.fixture
def hr_manager_user(org: Organization) -> User:
    """A User with hr_manager role scoped to org."""
    hr = User.objects.create_user(
        email="hr@tenureco.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role, _ = Role.objects.get_or_create(
        org_id=org.id,
        code="hr_manager",
        defaults={"name": "HR Manager", "is_system": True},
    )
    UserRole.objects.create(user=hr, role=role, granted_by=None)
    return hr


# ---------------------------------------------------------------------------
# make_employee_with_user factory fixture (§3.15 pattern)
# ---------------------------------------------------------------------------


@pytest.fixture
def make_employee_with_user(org: Organization, dept: Department):
    """Return a factory that creates an Employee backed by a real User."""
    _counter = [0]

    def _make(**overrides) -> Employee:
        _counter[0] += 1
        n = _counter[0]
        user = User.objects.create_user(
            email=f"emp{n}@tenureco.com",
            password="x",  # pragma: allowlist secret
            org_id=org.id,
        )
        defaults = dict(
            org_id=org.id,
            employee_code=f"E-{n:04d}",
            first_name="Alice",
            last_name=f"Emp{n}",
            email=f"emp{n}@tenureco.com",
            department=dept,
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            user=user,
        )
        defaults.update(overrides)
        return Employee.all_objects.create(**defaults)

    return _make


# ===========================================================================
# Tests
# ===========================================================================


@pytest.mark.django_db
def test_probation_ending_in_30_days_fires_once(make_employee_with_user, hr_manager_user):
    """Employee with probation_end_date = today+30 → alert fires; flag set; idempotent."""
    today = timezone.localdate()
    emp = make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=30),
    )
    counts = scan_tenure_endings(org_id=emp.org_id)
    assert counts["probation"] == 1
    assert Notification.objects.filter(type="employee.probation_ending_soon").exists()

    emp.refresh_from_db()
    assert emp.probation_alert_sent is True

    # Re-run: flag prevents a second alert.
    Notification.objects.all().delete()
    assert scan_tenure_endings(org_id=emp.org_id)["probation"] == 0
    assert not Notification.objects.filter(type="employee.probation_ending_soon").exists()


@pytest.mark.django_db
def test_contract_ending_in_30_days_fires_once(make_employee_with_user, hr_manager_user):
    """Employee with contract_end_date = today+30 → alert fires; flag set; idempotent."""
    today = timezone.localdate()
    emp = make_employee_with_user(
        contract_end_date=today + datetime.timedelta(days=30),
    )
    counts = scan_tenure_endings(org_id=emp.org_id)
    assert counts["contract"] == 1
    assert Notification.objects.filter(type="employee.contract_ending_soon").exists()

    emp.refresh_from_db()
    assert emp.contract_alert_sent is True

    # Idempotent on second run.
    Notification.objects.all().delete()
    assert scan_tenure_endings(org_id=emp.org_id)["contract"] == 0
    assert not Notification.objects.filter(type="employee.contract_ending_soon").exists()


@pytest.mark.django_db
def test_probation_ending_29_days_no_alert(make_employee_with_user, hr_manager_user):
    """Exact-day match only — 29 days away must not fire."""
    today = timezone.localdate()
    make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=29),
    )
    counts = scan_tenure_endings()
    assert counts["probation"] == 0


@pytest.mark.django_db
def test_probation_ending_31_days_no_alert(make_employee_with_user, hr_manager_user):
    """Exact-day match only — 31 days away must not fire."""
    today = timezone.localdate()
    make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=31),
    )
    counts = scan_tenure_endings()
    assert counts["probation"] == 0


@pytest.mark.django_db
def test_manager_also_receives_notification(make_employee_with_user, hr_manager_user, org, dept):
    """Employee's manager (a real User) must also receive the alert notification."""
    today = timezone.localdate()
    # Create a manager employee
    mgr_user = User.objects.create_user(
        email="mgr@tenureco.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    manager_emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="MGR-001",
        first_name="Bob",
        last_name="Manager",
        email="mgr@tenureco.com",
        department=dept,
        employment_type="fulltime",
        hire_date=datetime.date(2023, 1, 1),
        user=mgr_user,
    )
    emp = make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=30),
        manager=manager_emp,
    )
    scan_tenure_endings(org_id=emp.org_id)

    notified_users = set(
        Notification.objects.filter(type="employee.probation_ending_soon").values_list(
            "user_id", flat=True
        )
    )
    # The manager's user should be in the notification recipients
    assert mgr_user.id in notified_users


@pytest.mark.django_db
def test_org_scoping_no_cross_org_alerts(make_employee_with_user, hr_manager_user):
    """scan_tenure_endings(org_id=X) must not fire alerts for employees in another org."""
    today = timezone.localdate()
    emp = make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=30),
    )

    # Create a second org with its own employee
    other_org = Organization.objects.create(
        name="OtherCo",
        slug="otherco",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    other_dept = Department.all_objects.create(org_id=other_org.id, name="Ops")
    other_user = User.objects.create_user(
        email="other@otherco.com",
        password="x",  # pragma: allowlist secret
        org_id=other_org.id,
    )
    Employee.all_objects.create(
        org_id=other_org.id,
        employee_code="O-0001",
        first_name="Carol",
        last_name="OtherOrg",
        email="other@otherco.com",
        department=other_dept,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        probation_end_date=today + datetime.timedelta(days=30),
        user=other_user,
    )

    # Scan only for emp's org
    counts = scan_tenure_endings(org_id=emp.org_id)
    assert counts["probation"] == 1

    notified_users = set(
        Notification.objects.filter(type="employee.probation_ending_soon").values_list(
            "user_id", flat=True
        )
    )
    assert other_user.id not in notified_users


@pytest.mark.django_db
def test_no_org_filter_scans_all_orgs(make_employee_with_user, hr_manager_user):
    """scan_tenure_endings() without org_id fires for every qualifying employee."""
    today = timezone.localdate()
    emp = make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=30),
    )

    # Second org
    other_org = Organization.objects.create(
        name="AnotherCo",
        slug="anotherco",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    other_dept = Department.all_objects.create(org_id=other_org.id, name="Ops")
    other_user = User.objects.create_user(
        email="emp@anotherco.com",
        password="x",  # pragma: allowlist secret
        org_id=other_org.id,
    )
    Employee.all_objects.create(
        org_id=other_org.id,
        employee_code="A-0001",
        first_name="Dave",
        last_name="Other",
        email="emp@anotherco.com",
        department=other_dept,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        probation_end_date=today + datetime.timedelta(days=30),
        user=other_user,
    )

    counts = scan_tenure_endings()
    assert counts["probation"] >= 2


@pytest.mark.django_db
def test_tenure_scan_no_manager_does_not_crash(make_employee_with_user, hr_manager_user, org):
    """Employee with manager=None and probation_end_date=today+30 must not crash the scan.

    HR managers must still receive the notification and the return count must
    reflect one probation alert fired.
    """
    today = timezone.localdate()
    emp = make_employee_with_user(
        probation_end_date=today + datetime.timedelta(days=30),
        manager=None,
    )
    # Should not raise even though there is no manager to notify.
    counts = scan_tenure_endings(org_id=emp.org_id)

    assert counts["probation"] == 1

    notified_users = set(
        Notification.objects.filter(type="employee.probation_ending_soon").values_list(
            "user_id", flat=True
        )
    )
    # HR manager must still be notified.
    assert hr_manager_user.id in notified_users
