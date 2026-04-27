"""When a SHIFT worker clocks in on a public holiday, +1 REPLACEMENT leave."""

import datetime as dt
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from freezegun import freeze_time

from modules.attendance.services import AttendanceService
from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.organization.models import Department, Organization
from modules.schedule.models import Holiday


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    # Create REPLACEMENT leave type (M3b seeds this from country defaults)
    replacement = LeaveType.all_objects.create(
        org_id=org.id,
        code="REPLACEMENT",
        name="Replacement Leave",
        accrual_type="event_based",
        default_days=Decimal("0"),
        is_paid=True,
        is_statutory=False,
        gender_restriction="any",
    )
    # Holiday on 2026-05-01
    Holiday.all_objects.create(
        org_id=org.id,
        date=dt.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )

    def _emp(code, schedule_type):
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=dt.date(1985, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            role_title="x",
            employment_type="fulltime",
            schedule_type=schedule_type,
            hire_date=dt.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    shift_emp = _emp("SHIFT", "shift")
    fixed_emp = _emp("FIXED", "fixed")
    return org, replacement, shift_emp, fixed_emp


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_shift_worker_holiday_clockin_grants_replacement(stack):
    org, replacement, shift_emp, _ = stack
    rec = AttendanceService.clock_in(employee=shift_emp, source="web")
    assert rec.is_holiday_work is True
    assert rec.holiday_id is not None

    bal = LeaveBalance.all_objects.get(
        employee_id=shift_emp.id,
        leave_type=replacement,
        year=2026,
    )
    assert bal.accrued == Decimal("1")
    assert bal.available == Decimal("1")


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_fixed_worker_holiday_clockin_does_not_grant(stack):
    org, replacement, _, fixed_emp = stack
    AttendanceService.clock_in(employee=fixed_emp, source="web")
    # No REPLACEMENT balance was created for fixed-staff
    assert (
        LeaveBalance.all_objects.filter(
            employee_id=fixed_emp.id,
            leave_type=replacement,
        ).count()
        == 0
    )


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_replacement_grant_idempotent(stack):
    """Re-running clock_in on the same record must NOT double-grant."""
    org, replacement, shift_emp, _ = stack
    AttendanceService.clock_in(employee=shift_emp, source="web")
    AttendanceService.clock_in(employee=shift_emp, source="web")  # second call

    bal = LeaveBalance.all_objects.get(employee_id=shift_emp.id, leave_type=replacement, year=2026)
    # Still 1, not 2
    assert bal.accrued == Decimal("1")
    # Ledger has exactly one row for this reference
    rows = LeaveBalanceLedger.objects.filter(
        reference_type="attendance_record",
        reason="holiday_replacement",
    )
    assert rows.count() == 1


@pytest.mark.django_db
@freeze_time("2026-05-02 06:00:00")
def test_non_holiday_clockin_no_grant(stack):
    org, replacement, shift_emp, _ = stack
    rec = AttendanceService.clock_in(employee=shift_emp, source="web")
    assert rec.is_holiday_work is False
    assert (
        LeaveBalance.all_objects.filter(
            employee_id=shift_emp.id,
            leave_type=replacement,
        ).count()
        == 0
    )
