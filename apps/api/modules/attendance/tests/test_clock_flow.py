"""Clock-in / clock-out service flow."""

import datetime as dt
import os

import pytest
from cryptography.fernet import Fernet
from freezegun import freeze_time

from modules.attendance.models import AttendanceRecord
from modules.attendance.services import AttendanceService
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def employee():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@x.com",
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
        hire_date=dt.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.mark.django_db
@freeze_time("2026-06-01 09:00:00")
def test_clock_in_creates_record(employee):
    rec = AttendanceService.clock_in(
        employee=employee, source="web", ip="127.0.0.1", user_agent="pytest"
    )
    assert rec.work_date == dt.date(2026, 6, 1)
    assert rec.clock_in is not None
    assert rec.status == "partial"


@pytest.mark.django_db
@freeze_time("2026-06-01 09:00:00")
def test_clock_in_idempotent_on_same_day(employee):
    """Calling clock_in twice on the same day returns the same record (no duplicate)."""
    r1 = AttendanceService.clock_in(employee=employee, source="web")
    r2 = AttendanceService.clock_in(employee=employee, source="web")
    assert r1.id == r2.id
    assert AttendanceRecord.all_objects.count() == 1


@pytest.mark.django_db
def test_clock_out_completes_record(employee):
    with freeze_time("2026-06-01 09:00:00"):
        AttendanceService.clock_in(employee=employee, source="web")
    with freeze_time("2026-06-01 18:00:00"):
        rec = AttendanceService.clock_out(employee=employee, source="web")
    assert rec.clock_out is not None
    assert rec.status == "present"
    assert rec.computed_hours == 9.0


@pytest.mark.django_db
def test_clock_out_without_clock_in_creates_record_with_warning(employee):
    """Calling clock_out without prior clock_in creates a partial record (allowed but flagged)."""
    with freeze_time("2026-06-01 18:00:00"):
        rec = AttendanceService.clock_out(employee=employee, source="web")
    assert rec.clock_in is None
    assert rec.clock_out is not None
    assert rec.status == "partial"


@pytest.mark.django_db
def test_today_record_returns_or_none(employee):
    with freeze_time("2026-06-01 12:00:00"):
        # No record yet
        assert AttendanceService.today(employee=employee) is None
        AttendanceService.clock_in(employee=employee, source="web")
        rec = AttendanceService.today(employee=employee)
        assert rec is not None
