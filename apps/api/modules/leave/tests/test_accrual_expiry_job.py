"""run_carry_forward_expiry -- daily debit at expiry date."""

import datetime
from decimal import Decimal

import pytest

from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.accrual import run_carry_forward_expiry
from modules.organization.models import Department, Organization


@pytest.fixture
def expired_balance():
    org = Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    emp = Employee.all_objects.create(
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
    annual = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("12"),
    )
    bal = LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=annual,
        year=2027,
        entitled=Decimal("12"),
        carried_forward=Decimal("5"),
        taken=Decimal("3"),
        carried_forward_expires_at=datetime.date(2027, 4, 1),
    )
    return {"org": org, "emp": emp, "annual": annual, "bal": bal}


@pytest.mark.django_db
def test_pre_expiry_no_debit(expired_balance) -> None:
    run_carry_forward_expiry(today=datetime.date(2027, 3, 31))
    bal = LeaveBalance.all_objects.get(id=expired_balance["bal"].id)
    assert bal.carried_forward == Decimal("5")  # untouched


@pytest.mark.django_db
def test_on_expiry_debits_unused_only(expired_balance) -> None:
    """5 carried, 3 taken (all from carry pool) -> 2 unused -> debit 2."""
    run_carry_forward_expiry(today=datetime.date(2027, 4, 1))
    bal = LeaveBalance.all_objects.get(id=expired_balance["bal"].id)
    # Net carried_forward after expiry debit: 5 - 2 = 3
    assert bal.carried_forward == Decimal("3")
    expired_entry = LeaveBalanceLedger.objects.get(
        employee_id=expired_balance["emp"].id,
        reference_type="carry_forward_expired",
    )
    assert expired_entry.delta == Decimal("-2")


@pytest.mark.django_db
def test_expiry_idempotent(expired_balance) -> None:
    run_carry_forward_expiry(today=datetime.date(2027, 4, 1))
    run_carry_forward_expiry(today=datetime.date(2027, 4, 1))
    n = LeaveBalanceLedger.objects.filter(
        employee_id=expired_balance["emp"].id,
        reference_type="carry_forward_expired",
    ).count()
    assert n == 1
