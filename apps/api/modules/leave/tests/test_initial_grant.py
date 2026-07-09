"""Tests for grant_initial_leave — seed balances at employee creation."""

import datetime
import uuid
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from modules.employee.models import Employee
from modules.leave.models import EmployeeLeaveOverride, LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.initial_grant import grant_initial_leave
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
def dept(org) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Engineering")


@pytest.fixture
def employee_factory(dept):
    _counter = [0]

    def _make(org_id, hire_date):
        _counter[0] += 1
        return Employee.all_objects.create(
            org_id=org_id,
            employee_code=f"E{_counter[0]:03d}",
            first_name="Ada",
            last_name="Lovelace",
            email=f"ada{_counter[0]}@test.local",
            employment_type="fulltime",
            hire_date=hire_date,
            department=dept,
        )

    return _make


def _lt(org, code="ANNUAL", days="8", accrual="annual"):
    return LeaveType.all_objects.create(
        org_id=org.id,
        code=code,
        name=code.title(),
        default_days=Decimal(days),
        accrual_type=accrual,
    )


def test_grants_prorated_balance_for_midyear_hire(org, employee_factory):
    lt = _lt(org)
    emp = employee_factory(org_id=org.id, hire_date=datetime.date(2026, 7, 1))  # July → 6/12
    grant_initial_leave(
        employee=emp,
        items=[{"leave_type_id": lt.id, "days_per_year": Decimal("8"), "permanent": False}],
        actor_id=None,
        year=2026,
    )
    bal = LeaveBalance.all_objects.get(
        org_id=org.id, employee_id=emp.id, leave_type=lt, year=2026
    )
    assert bal.entitled == Decimal("4.00")  # 8 * 6/12
    assert not EmployeeLeaveOverride.all_objects.filter(employee_id=emp.id).exists()


def test_permanent_creates_override(org, employee_factory):
    lt = _lt(org)
    emp = employee_factory(org_id=org.id, hire_date=datetime.date(2026, 1, 1))
    actor = uuid.uuid4()
    grant_initial_leave(
        employee=emp,
        items=[{"leave_type_id": lt.id, "days_per_year": Decimal("20"), "permanent": True}],
        actor_id=actor,
        year=2026,
    )
    ov = EmployeeLeaveOverride.all_objects.get(employee_id=emp.id, leave_type=lt)
    assert ov.days_override == Decimal("20")
    assert ov.effective_from == datetime.date(2026, 1, 1)
    assert ov.effective_to is None
    assert ov.created_by == actor


def test_grant_is_idempotent(org, employee_factory):
    lt = _lt(org)
    emp = employee_factory(org_id=org.id, hire_date=datetime.date(2026, 1, 1))
    args = dict(
        employee=emp,
        items=[{"leave_type_id": lt.id, "days_per_year": Decimal("15"), "permanent": True}],
        actor_id=uuid.uuid4(),
        year=2026,
    )
    grant_initial_leave(**args)
    grant_initial_leave(**args)

    assert LeaveBalance.all_objects.filter(employee_id=emp.id, leave_type=lt, year=2026).count() == 1
    assert EmployeeLeaveOverride.all_objects.filter(employee_id=emp.id, leave_type=lt).count() == 1
    assert LeaveBalanceLedger.objects.filter(employee_id=emp.id, leave_type=lt).count() == 1


def test_rejects_event_based_leave_type(org, employee_factory):
    lt = _lt(org, code="MATERNITY", accrual="event_based")
    emp = employee_factory(org_id=org.id, hire_date=datetime.date(2026, 1, 1))
    with pytest.raises(ValidationError):
        grant_initial_leave(
            employee=emp,
            items=[{"leave_type_id": lt.id, "days_per_year": Decimal("98"), "permanent": False}],
            actor_id=None,
            year=2026,
        )
