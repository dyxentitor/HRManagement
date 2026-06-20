"""Balance over-draw guard on LeaveRequest.submit (v1.18.0).

Paid leave types cannot be submitted for more days than the employee has
available; unpaid types are exempt.
"""

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
    user = User.objects.create_user(
        email="e@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    today = timezone.localdate()
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="E1",
        last_name="x",
        email="e1@x.com",
        phone="+1",
        date_of_birth=dt.date(1985, 1, 1),
        gender="male",
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
        hire_date=today - timedelta(days=800),
        status="active",
        user=user,
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    annual = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("16"),
        is_paid=True,
    )
    unpaid = LeaveType.all_objects.create(
        org_id=org.id,
        code="UNPAID",
        name="Unpaid",
        accrual_type="none",
        default_days=Decimal("0"),
        is_paid=False,
    )
    return {"org": org, "user": user, "emp": emp, "annual": annual, "unpaid": unpaid}


def _balance(emp, lt, *, accrued, year):
    LeaveBalance.all_objects.create(
        org_id=emp.org_id,
        employee_id=emp.id,
        leave_type=lt,
        year=year,
        entitled=Decimal(str(accrued)),
        accrued=Decimal(str(accrued)),
    )


def _req(emp, lt, *, start, days):
    return LeaveRequest.objects.create(
        org_id=emp.org_id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=start,
        end_date=start + timedelta(days=int(days) - 1 if days >= 1 else 0),
        total_days=Decimal(str(days)),
        status="draft",
    )


@pytest.mark.django_db
def test_overdraw_blocked_on_submit(setup) -> None:
    start = timezone.localdate() + timedelta(days=20)
    _balance(setup["emp"], setup["annual"], accrued=2, year=start.year)
    req = _req(setup["emp"], setup["annual"], start=start, days=3)
    with pytest.raises(ValidationError, match=r"(?i)insufficient|balance"):
        LeaveRequestService.submit(req, actor=setup["user"])
    # nothing held — request did not move
    req.refresh_from_db()
    assert req.status == "draft"


@pytest.mark.django_db
def test_overdraw_validator_allows_exact_balance(setup) -> None:
    start = timezone.localdate() + timedelta(days=20)
    _balance(setup["emp"], setup["annual"], accrued=3, year=start.year)
    req = _req(setup["emp"], setup["annual"], start=start, days=3)
    # exactly available — no raise
    LeaveRequestService._validate_eligibility(req)


@pytest.mark.django_db
def test_overdraw_validator_allows_within_balance(setup) -> None:
    start = timezone.localdate() + timedelta(days=20)
    _balance(setup["emp"], setup["annual"], accrued=5, year=start.year)
    req = _req(setup["emp"], setup["annual"], start=start, days=2)
    LeaveRequestService._validate_eligibility(req)


@pytest.mark.django_db
def test_overdraw_exempts_unpaid(setup) -> None:
    start = timezone.localdate() + timedelta(days=20)
    # no balance / 0 available, unpaid type — must NOT raise
    req = _req(setup["emp"], setup["unpaid"], start=start, days=5)
    LeaveRequestService._validate_eligibility(req)
