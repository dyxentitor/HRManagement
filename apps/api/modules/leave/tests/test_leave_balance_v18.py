"""v1.8.0 LeaveBalance carry-forward expiry column."""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from modules.leave.models import LeaveBalance, LeaveType
from modules.organization.models import Organization


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
def leave_type(org: Organization) -> LeaveType:
    return LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("8"),
    )


@pytest.mark.django_db
def test_balance_default_expires_at_is_null(org: Organization, leave_type: LeaveType) -> None:
    bal = LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=uuid.uuid4(),
        leave_type=leave_type,
        year=2026,
    )
    assert bal.carried_forward_expires_at is None


@pytest.mark.django_db
def test_balance_writable_expires_at(org: Organization, leave_type: LeaveType) -> None:
    emp_id = uuid.uuid4()
    bal = LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=leave_type,
        year=2026,
        carried_forward=Decimal("2"),
        carried_forward_expires_at=date(2026, 4, 1),
    )
    fresh = LeaveBalance.all_objects.get(id=bal.id)
    assert fresh.carried_forward_expires_at == date(2026, 4, 1)
