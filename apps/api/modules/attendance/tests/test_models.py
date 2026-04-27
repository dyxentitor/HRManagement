"""AttendanceRecord model basics."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.attendance.models import AttendanceRecord
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
        date_of_birth=datetime.date(1985, 1, 1),
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
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_attendance_record_create(employee) -> None:
    r = AttendanceRecord.all_objects.create(
        org_id=employee.org_id,
        employee=employee,
        work_date=datetime.date(2026, 6, 1),
        source="web",
    )
    assert r.is_holiday_work is False
    assert r.status == "absent"  # no clock_in/out yet


@pytest.mark.django_db
def test_unique_per_employee_date(employee) -> None:
    AttendanceRecord.all_objects.create(
        org_id=employee.org_id,
        employee=employee,
        work_date=datetime.date(2026, 6, 1),
        source="web",
    )
    with pytest.raises(IntegrityError):
        AttendanceRecord.all_objects.create(
            org_id=employee.org_id,
            employee=employee,
            work_date=datetime.date(2026, 6, 1),
            source="web",
        )


@pytest.mark.django_db
def test_status_transitions_with_clock(employee) -> None:
    import datetime as dt

    r = AttendanceRecord.all_objects.create(
        org_id=employee.org_id,
        employee=employee,
        work_date=datetime.date(2026, 6, 1),
        clock_in=dt.datetime(2026, 6, 1, 9, 0, tzinfo=dt.UTC),
        source="web",
    )
    r.recompute_status()
    r.save()
    assert r.status in ("present", "late", "partial")
