"""run_year_start_accrual idempotency + correctness."""

import datetime
from decimal import Decimal

import pytest

from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeavePolicy, LeaveType
from modules.leave.services.accrual import run_year_start_accrual
from modules.organization.models import Department, Organization


def _emp(
    org: Organization,
    dept: Department,
    *,
    code: str,
    hire_date: datetime.date,
    status: str = "active",
) -> Employee:
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
        hire_date=hire_date,
        status=status,
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
    annual = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("8"),
    )
    LeavePolicy.all_objects.create(
        org_id=org.id,
        leave_type=annual,
        days_per_year=Decimal("8"),
        tenure_brackets=[
            {"min_years": 0, "days": 8},
            {"min_years": 2, "days": 12},
            {"min_years": 5, "days": 16},
        ],
        effective_from=datetime.date(2025, 1, 1),
    )
    e_old = _emp(org, dept, code="OLD", hire_date=datetime.date(2022, 3, 1))  # ~4y -> 12d
    e_new = _emp(org, dept, code="NEW", hire_date=datetime.date(2026, 7, 1))  # 6mo of 8 = 4
    e_term = _emp(org, dept, code="TERM", hire_date=datetime.date(2020, 1, 1), status="terminated")
    return {
        "org": org,
        "annual": annual,
        "e_old": e_old,
        "e_new": e_new,
        "e_term": e_term,
    }


@pytest.mark.django_db
def test_year_start_creates_balance_and_ledger_per_active_employee(setup) -> None:
    result = run_year_start_accrual(org_id=setup["org"].id, year=2026)
    assert result["granted"] == 2  # active only

    bal_old = LeaveBalance.all_objects.get(
        employee_id=setup["e_old"].id, leave_type=setup["annual"], year=2026
    )
    assert bal_old.entitled == Decimal("12")  # tenure tier; not pro-rated

    bal_new = LeaveBalance.all_objects.get(
        employee_id=setup["e_new"].id, leave_type=setup["annual"], year=2026
    )
    # 8d default tier x 6/12 (Jul hire) = 4d
    assert bal_new.entitled == Decimal("4.0")

    # No balance for terminated employee
    assert not LeaveBalance.all_objects.filter(employee_id=setup["e_term"].id).exists()


@pytest.mark.django_db
def test_year_start_idempotent_on_rerun(setup) -> None:
    run_year_start_accrual(org_id=setup["org"].id, year=2026)
    run_year_start_accrual(org_id=setup["org"].id, year=2026)
    n = LeaveBalanceLedger.objects.filter(
        employee_id=setup["e_old"].id,
        reference_type="accrual_year_start",
        reason="accrual",
    ).count()
    assert n == 1


@pytest.mark.django_db
def test_year_start_dry_run_writes_nothing(setup) -> None:
    result = run_year_start_accrual(org_id=setup["org"].id, year=2026, dry_run=True)
    assert result["granted"] == 2
    assert LeaveBalance.all_objects.count() == 0
    assert LeaveBalanceLedger.objects.count() == 0
