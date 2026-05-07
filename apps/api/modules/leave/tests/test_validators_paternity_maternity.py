"""Statutory eligibility validators on LeaveRequest.submit (v1.8.0)."""

import datetime as dt
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveBalance, LeaveRequest, LeaveType
from modules.leave.services.leave_request import LeaveRequestService
from modules.organization.models import Department, Organization


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    user_recent = User.objects.create_user(
        email="recent@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    user_old = User.objects.create_user(
        email="old@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    today = timezone.localdate()

    def _emp(user, code, hire_offset_days):
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=dt.date(1985, 1, 1),
            gender="male",
            nationality="MY",
            marital_status="married",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            role_title="x",
            employment_type="fulltime",
            hire_date=today - timedelta(days=hire_offset_days),
            status="active",
            user=user,
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    emp_recent = _emp(user_recent, "RECENT", 180)  # ~6 months
    emp_old = _emp(user_old, "OLD", 400)  # > 12 months

    paternity = LeaveType.all_objects.create(
        org_id=org.id,
        code="PATERNITY",
        name="Paternity",
        accrual_type="event_based",
        default_days=Decimal("7"),
        requires_service_months=12,
        notice_days_required=30,
        max_per_lifetime_events=5,
        gender_restriction="male",
    )
    return {
        "org": org,
        "user_recent": user_recent,
        "user_old": user_old,
        "emp_recent": emp_recent,
        "emp_old": emp_old,
        "paternity": paternity,
    }


def _build_req(emp, lt, *, start: dt.date, days: Decimal = Decimal("7")) -> LeaveRequest:
    return LeaveRequest.objects.create(
        org_id=emp.org_id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=start,
        end_date=start + timedelta(days=int(days) - 1),
        total_days=days,
        status="draft",
    )


def _seed_balance(emp, lt, year):
    LeaveBalance.all_objects.create(
        org_id=emp.org_id,
        employee_id=emp.id,
        leave_type=lt,
        year=year,
        entitled=Decimal("7"),
        accrued=Decimal("7"),
    )


@pytest.mark.django_db
def test_paternity_blocked_for_short_service(setup) -> None:
    today = timezone.localdate()
    start = today + timedelta(days=60)
    _seed_balance(setup["emp_recent"], setup["paternity"], start.year)
    req = _build_req(setup["emp_recent"], setup["paternity"], start=start)
    with pytest.raises(ValidationError, match="continuous service"):
        LeaveRequestService.submit(req, actor=setup["user_recent"])


@pytest.mark.django_db
def test_paternity_blocked_below_notice_days(setup) -> None:
    today = timezone.localdate()
    start = today + timedelta(days=10)  # less than 30
    _seed_balance(setup["emp_old"], setup["paternity"], start.year)
    req = _build_req(setup["emp_old"], setup["paternity"], start=start)
    with pytest.raises(ValidationError, match="advance notice"):
        LeaveRequestService.submit(req, actor=setup["user_old"])


@pytest.mark.django_db
def test_paternity_blocked_at_lifetime_cap(setup) -> None:
    today = timezone.localdate()
    # Pre-create 5 approved paternity requests
    for i in range(5):
        LeaveRequest.objects.create(
            org_id=setup["org"].id,
            employee_id=setup["emp_old"].id,
            leave_type=setup["paternity"],
            start_date=dt.date(2020 + i, 1, 1),
            end_date=dt.date(2020 + i, 1, 7),
            total_days=Decimal("7"),
            status="approved",
        )

    start = today + timedelta(days=60)
    _seed_balance(setup["emp_old"], setup["paternity"], start.year)
    req = _build_req(setup["emp_old"], setup["paternity"], start=start)
    with pytest.raises(ValidationError, match="confinements"):
        LeaveRequestService.submit(req, actor=setup["user_old"])


@pytest.mark.django_db
def test_eligible_paternity_passes_validator(setup) -> None:
    """Validator must not raise when employee is eligible.

    The downstream workflow engine still needs an approver chain to fully
    submit; we test only the validator gate here by calling it directly.
    """
    today = timezone.localdate()
    start = today + timedelta(days=60)
    _seed_balance(setup["emp_old"], setup["paternity"], start.year)
    req = _build_req(setup["emp_old"], setup["paternity"], start=start)
    # Direct validator call — should NOT raise.
    LeaveRequestService._validate_eligibility(req)
