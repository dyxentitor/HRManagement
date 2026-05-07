"""compute_entitlement priority: override > policy > LeaveType.default_days."""

import datetime
from decimal import Decimal

import pytest

from modules.employee.models import Employee
from modules.leave.models import EmployeeLeaveOverride, LeavePolicy, LeaveType
from modules.leave.services.accrual import compute_entitlement
from modules.organization.models import Department, Organization


def _emp(org: Organization, dept: Department, *, hire_date: datetime.date) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="Ada",
        last_name="Lovelace",
        email="ada@x.com",
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
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


@pytest.fixture
def annual(org: Organization) -> LeaveType:
    return LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("8"),
    )


@pytest.mark.django_db
def test_falls_back_to_default_days_when_no_policy_no_override(
    org: Organization, dept: Department, annual: LeaveType
) -> None:
    employee = _emp(org, dept, hire_date=datetime.date(2022, 3, 1))
    result = compute_entitlement(employee=employee, leave_type=annual, year=2026)
    assert result == Decimal("8")


@pytest.mark.django_db
def test_policy_with_brackets_resolves_to_correct_tier(
    org: Organization, dept: Department, annual: LeaveType
) -> None:
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
    employee = _emp(org, dept, hire_date=datetime.date(2022, 3, 1))
    # ~4y tenure on 2026-01-01 → 12 days tier
    result = compute_entitlement(employee=employee, leave_type=annual, year=2026)
    assert result == Decimal("12")


@pytest.mark.django_db
def test_override_wins_over_policy(org: Organization, dept: Department, annual: LeaveType) -> None:
    LeavePolicy.all_objects.create(
        org_id=org.id,
        leave_type=annual,
        days_per_year=Decimal("8"),
        tenure_brackets=[
            {"min_years": 0, "days": 8},
            {"min_years": 2, "days": 12},
        ],
        effective_from=datetime.date(2025, 1, 1),
    )
    employee = _emp(org, dept, hire_date=datetime.date(2022, 3, 1))
    EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=employee.id,
        leave_type=annual,
        days_override=Decimal("21"),
        effective_from=datetime.date(2025, 6, 1),
    )
    result = compute_entitlement(employee=employee, leave_type=annual, year=2026)
    assert result == Decimal("21")


@pytest.mark.django_db
def test_inactive_override_ignored(org: Organization, dept: Department, annual: LeaveType) -> None:
    """Override starts AFTER year-start → ignored, falls back to default."""
    employee = _emp(org, dept, hire_date=datetime.date(2022, 3, 1))
    EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=employee.id,
        leave_type=annual,
        days_override=Decimal("21"),
        effective_from=datetime.date(2026, 6, 1),
    )
    result = compute_entitlement(employee=employee, leave_type=annual, year=2026)
    assert result == Decimal("8")


@pytest.mark.django_db
def test_expired_override_ignored(org: Organization, dept: Department, annual: LeaveType) -> None:
    """Override with effective_to before year-start → ignored."""
    employee = _emp(org, dept, hire_date=datetime.date(2022, 3, 1))
    EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=employee.id,
        leave_type=annual,
        days_override=Decimal("21"),
        effective_from=datetime.date(2024, 1, 1),
        effective_to=datetime.date(2025, 12, 31),
    )
    result = compute_entitlement(employee=employee, leave_type=annual, year=2026)
    assert result == Decimal("8")
