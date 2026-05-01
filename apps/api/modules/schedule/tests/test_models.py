"""WorkSchedule, Shift, ShiftAssignment, Holiday model tests."""

import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.schedule.models import (
    Holiday,
    Shift,
    ShiftAssignment,
    WorkSchedule,
)


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


@pytest.fixture
def employee(org: Organization, dept: Department) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
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
def test_work_schedule_create(org: Organization, employee: Employee) -> None:
    ws = WorkSchedule.all_objects.create(
        org_id=org.id,
        employee=employee,
        name="Default",
        pattern={
            "mon": {"start": "09:00", "end": "18:00"},
            "tue": {"start": "09:00", "end": "18:00"},
            "wed": {"start": "09:00", "end": "18:00"},
            "thu": {"start": "09:00", "end": "18:00"},
            "fri": {"start": "09:00", "end": "18:00"},
        },
        effective_from=datetime.date(2026, 1, 1),
    )
    assert ws.pattern["mon"]["start"] == "09:00"


@pytest.mark.django_db
def test_shift_create(org: Organization) -> None:
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=datetime.time(6, 0),
        end_time=datetime.time(14, 0),
        crosses_midnight=False,
        color="#3B82F6",
    )
    assert s.crosses_midnight is False


@pytest.mark.django_db
def test_shift_crosses_midnight(org: Organization) -> None:
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Night",
        code="N",
        start_time=datetime.time(22, 0),
        end_time=datetime.time(7, 0),
        crosses_midnight=True,
        color="#1E40AF",
    )
    assert s.crosses_midnight is True


@pytest.mark.django_db
def test_shift_assignment_unique_per_employee_date(org: Organization, employee: Employee) -> None:
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=datetime.time(6, 0),
        end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=employee,
        shift=s,
        work_date=datetime.date(2026, 6, 1),
        status="scheduled",
        assigned_by=uuid.uuid4(),
    )
    with pytest.raises(IntegrityError):
        ShiftAssignment.all_objects.create(
            org_id=org.id,
            employee=employee,
            shift=s,
            work_date=datetime.date(2026, 6, 1),
            status="scheduled",
            assigned_by=uuid.uuid4(),
        )


@pytest.mark.django_db
def test_holiday_create(org: Organization) -> None:
    h = Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )
    assert h.applies_to_country_code == "MY"


@pytest.mark.django_db
def test_holiday_unique_per_org_date_name(org: Organization) -> None:
    Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )
    with pytest.raises(IntegrityError):
        Holiday.all_objects.create(
            org_id=org.id,
            date=datetime.date(2026, 5, 1),
            name="Labour Day",
            type="federal",
            applies_to_country_code="MY",
        )
