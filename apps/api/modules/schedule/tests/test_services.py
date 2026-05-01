"""ScheduleService + HolidayService."""

import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.schedule.models import Holiday, Shift, ShiftAssignment, WorkSchedule
from modules.schedule.services.holiday import HolidayService
from modules.schedule.services.schedule import ScheduleService


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    def _emp(code):
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
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

    return org, dept, _emp


@pytest.mark.django_db
def test_get_pattern_for_date_returns_day_pattern(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    WorkSchedule.all_objects.create(
        org_id=org.id,
        employee=e,
        name="Default",
        pattern={"mon": {"start": "09:00", "end": "18:00"}},
        effective_from=datetime.date(2026, 1, 1),
    )
    pattern = ScheduleService.get_pattern_for_date(
        employee=e, on_date=datetime.date(2026, 6, 1)
    )  # Mon
    assert pattern == {"start": "09:00", "end": "18:00"}


@pytest.mark.django_db
def test_get_pattern_for_off_day_returns_none(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    WorkSchedule.all_objects.create(
        org_id=org.id,
        employee=e,
        name="Default",
        pattern={"mon": {"start": "09:00", "end": "18:00"}},
        effective_from=datetime.date(2026, 1, 1),
    )
    pattern = ScheduleService.get_pattern_for_date(
        employee=e, on_date=datetime.date(2026, 6, 7)
    )  # Sun
    assert pattern is None


@pytest.mark.django_db
def test_bulk_assign_creates_one_assignment_per_date(setup) -> None:
    org, _, _emp = setup
    e1, e2 = _emp("E1"), _emp("E2")
    s_morning = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=datetime.time(6, 0),
        end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    actor_id = uuid.uuid4()
    created = ScheduleService.bulk_assign_pattern(
        org_id=org.id,
        employee_ids=[e1.id, e2.id],
        pattern_by_weekday={"mon": s_morning.id, "tue": s_morning.id},
        date_from=datetime.date(2026, 6, 1),  # Mon
        date_to=datetime.date(2026, 6, 7),  # Sun
        assigned_by=actor_id,
    )
    # 2 employees x 2 weekdays (Mon, Tue in the week) = 4 assignments
    assert created == 4
    assert ShiftAssignment.all_objects.count() == 4


@pytest.mark.django_db
def test_publish_assignments_stamps_published_at(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    s = Shift.all_objects.create(
        org_id=org.id,
        name="X",
        code="X",
        start_time=datetime.time(9, 0),
        end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e,
        shift=s,
        work_date=datetime.date(2026, 6, 1),
        status="scheduled",
        assigned_by=uuid.uuid4(),
    )
    n = ScheduleService.publish_for_period(
        org_id=org.id,
        date_from=datetime.date(2026, 6, 1),
        date_to=datetime.date(2026, 6, 7),
    )
    assert n == 1
    sa = ShiftAssignment.all_objects.get(employee=e, work_date=datetime.date(2026, 6, 1))
    assert sa.published_at is not None


@pytest.mark.django_db
def test_holiday_service_is_holiday(setup) -> None:
    org, _, _ = setup
    Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 5, 1)) is True
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 5, 2)) is False


@pytest.mark.django_db
def test_holiday_service_get_for_date(setup) -> None:
    org, _, _ = setup
    h = Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 5, 1),
        name="Labour Day",
        type="federal",
        applies_to_country_code="MY",
    )
    found = HolidayService.get_for_date(org_id=org.id, on_date=datetime.date(2026, 5, 1))
    assert found is not None and found.id == h.id
