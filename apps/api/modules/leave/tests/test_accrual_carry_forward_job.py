"""run_year_end_carry_forward -- cap, expiry stamp, idempotency."""

import datetime
from decimal import Decimal

import pytest

from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.accrual import run_year_end_carry_forward
from modules.organization.models import Department, Organization


def _emp(org: Organization, dept: Department) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="A1",
        first_name="A",
        last_name="x",
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
        hire_date=datetime.date(2022, 1, 1),
        status="active",
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


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
    emp = _emp(org, dept)
    annual = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("12"),
        carry_forward_max=Decimal("5"),
        carry_forward_expiry_months=3,
    )
    sick = LeaveType.all_objects.create(
        org_id=org.id,
        code="MEDICAL",
        name="Sick",
        accrual_type="annual",
        default_days=Decimal("14"),
        carry_forward_max=Decimal("0"),  # use-it-or-lose-it
    )
    LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=annual,
        year=2026,
        entitled=Decimal("12"),
        taken=Decimal("4"),  # 8 unused; cap to 5
    )
    LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=sick,
        year=2026,
        entitled=Decimal("14"),
        taken=Decimal("3"),  # 11 unused; cap=0 -> skip
    )
    return {"org": org, "emp": emp, "annual": annual, "sick": sick}


@pytest.mark.django_db
def test_carry_caps_at_max_and_stamps_expiry(setup) -> None:
    run_year_end_carry_forward(org_id=setup["org"].id, year=2026)
    next_bal = LeaveBalance.all_objects.get(
        employee_id=setup["emp"].id, leave_type=setup["annual"], year=2027
    )
    assert next_bal.carried_forward == Decimal("5")  # capped
    assert next_bal.carried_forward_expires_at == datetime.date(2027, 4, 1)


@pytest.mark.django_db
def test_carry_skips_when_max_zero(setup) -> None:
    run_year_end_carry_forward(org_id=setup["org"].id, year=2026)
    assert not LeaveBalance.all_objects.filter(
        employee_id=setup["emp"].id, leave_type=setup["sick"], year=2027
    ).exists()


@pytest.mark.django_db
def test_carry_idempotent(setup) -> None:
    run_year_end_carry_forward(org_id=setup["org"].id, year=2026)
    run_year_end_carry_forward(org_id=setup["org"].id, year=2026)
    ledger_count = LeaveBalanceLedger.objects.filter(
        employee_id=setup["emp"].id, reason="carry_forward"
    ).count()
    assert ledger_count == 1


@pytest.mark.django_db
def test_carry_zero_when_taken_exceeds_entitled(setup) -> None:
    bal = LeaveBalance.all_objects.get(
        employee_id=setup["emp"].id, leave_type=setup["annual"], year=2026
    )
    bal.taken = Decimal("12")  # all used
    bal.save()
    run_year_end_carry_forward(org_id=setup["org"].id, year=2026)
    next_bal = LeaveBalance.all_objects.filter(
        employee_id=setup["emp"].id, leave_type=setup["annual"], year=2027
    ).first()
    if next_bal:
        assert next_bal.carried_forward == Decimal("0")
