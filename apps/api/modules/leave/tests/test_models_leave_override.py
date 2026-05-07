"""EmployeeLeaveOverride model tests."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError

from modules.leave.models import EmployeeLeaveOverride, LeaveType
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
def test_create_override(org: Organization, leave_type: LeaveType) -> None:
    emp_id = uuid.uuid4()
    ov = EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=leave_type,
        days_override=Decimal("21"),
        effective_from=date(2026, 1, 1),
        note="Senior hire offer letter",
    )
    assert ov.days_override == Decimal("21")
    assert ov.effective_to is None


@pytest.mark.django_db
def test_unique_per_employee_type_effective_from(org: Organization, leave_type: LeaveType) -> None:
    emp_id = uuid.uuid4()
    EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=leave_type,
        days_override=Decimal("21"),
        effective_from=date(2026, 1, 1),
    )
    with pytest.raises(IntegrityError):
        EmployeeLeaveOverride.all_objects.create(
            org_id=org.id,
            employee_id=emp_id,
            leave_type=leave_type,
            days_override=Decimal("25"),
            effective_from=date(2026, 1, 1),
        )


@pytest.mark.django_db
def test_soft_delete_releases_unique_constraint(org: Organization, leave_type: LeaveType) -> None:
    emp_id = uuid.uuid4()
    a = EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=leave_type,
        days_override=Decimal("21"),
        effective_from=date(2026, 1, 1),
    )
    a.delete()  # soft-delete
    # New row with same key should be allowed
    EmployeeLeaveOverride.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=leave_type,
        days_override=Decimal("25"),
        effective_from=date(2026, 1, 1),
    )
