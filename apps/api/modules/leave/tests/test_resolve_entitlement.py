"""Parity tests: resolve_entitlement (param-based) vs compute_entitlement (employee-based)."""

import datetime
from decimal import Decimal

import pytest

from modules.employee.models import Employee
from modules.leave.models import LeaveType
from modules.leave.services.accrual import compute_entitlement, resolve_entitlement
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


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


def test_resolve_falls_back_to_default_days(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        default_days=Decimal("8"),
        accrual_type="annual",
    )
    days = resolve_entitlement(
        org_id=org.id,
        department_id=None,
        role_id=None,
        hire_date=datetime.date(2020, 1, 1),
        leave_type=lt,
        year=2026,
    )
    assert days == Decimal("8")


def test_compute_entitlement_matches_resolve_when_no_override(
    org: Organization, dept: Department
) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        default_days=Decimal("8"),
        accrual_type="annual",
    )
    emp = _emp(org, dept, hire_date=datetime.date(2020, 1, 1))
    assert compute_entitlement(employee=emp, leave_type=lt, year=2026) == resolve_entitlement(
        org_id=org.id,
        department_id=(emp.department.id if emp.department else None),
        role_id=getattr(emp, "primary_role_id", None),
        hire_date=emp.hire_date,
        leave_type=lt,
        year=2026,
    )
