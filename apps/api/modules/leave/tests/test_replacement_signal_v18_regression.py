"""v1.8.0 regression: HOSPITALIZATION (new leave type) must not receive
accidental cross-type credit when the holiday-replacement signal fires.
"""

import datetime as dt
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from freezegun import freeze_time

from modules.attendance.services import AttendanceService
from modules.employee.models import Employee
from modules.leave.models import LeaveBalanceLedger, LeaveType
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
    LeaveType.all_objects.create(
        org_id=org.id,
        code="REPLACEMENT",
        name="Replacement Leave",
        accrual_type="event_based",
        default_days=Decimal("0"),
        is_paid=True,
    )
    # NEW v1.8.0 leave type — must not be touched by the replacement signal
    LeaveType.all_objects.create(
        org_id=org.id,
        code="HOSPITALIZATION",
        name="Hospitalization Leave",
        accrual_type="annual",
        default_days=Decimal("60"),
        is_paid=True,
    )
    Holiday.all_objects.create(
        org_id=org.id,
        date=dt.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="SW",
        first_name="Shift",
        last_name="Worker",
        email="sw@x.com",
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
        schedule_type="shift",
        hire_date=dt.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    return org, emp


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_holiday_clockin_does_not_credit_hospitalization(stack):
    _org, emp = stack
    AttendanceService.clock_in(employee=emp, source="web")

    # REPLACEMENT got the credit (existing tested behaviour)
    rep_entries = LeaveBalanceLedger.objects.filter(
        employee_id=emp.id,
        leave_type__code="REPLACEMENT",
    )
    assert rep_entries.count() == 1

    # HOSPITALIZATION must NOT have any ledger entries from the holiday signal
    hosp_entries = LeaveBalanceLedger.objects.filter(
        employee_id=emp.id,
        leave_type__code="HOSPITALIZATION",
    )
    assert hosp_entries.count() == 0
