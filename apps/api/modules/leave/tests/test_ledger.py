"""LeaveLedgerService.append idempotency + balance recompute."""

import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveBalanceLedger, LeaveType
from modules.leave.services.ledger import LeaveLedgerService
from modules.organization.models import Organization


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    return org, lt, uuid.uuid4()


@pytest.mark.django_db
def test_append_creates_ledger_row(setup) -> None:
    org, lt, emp_id = setup
    row = LeaveLedgerService.append(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("14"),
        reason="accrual",
    )
    assert row.id is not None
    assert row.delta == Decimal("14")


@pytest.mark.django_db
def test_append_with_reference_idempotent(setup) -> None:
    org, lt, emp_id = setup
    ref_id = uuid.uuid4()
    r1 = LeaveLedgerService.append(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("1"),
        reason="holiday_replacement",
        reference_type="attendance_record",
        reference_id=ref_id,
    )
    r2 = LeaveLedgerService.append(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("1"),
        reason="holiday_replacement",
        reference_type="attendance_record",
        reference_id=ref_id,
    )
    assert r1.id == r2.id  # second call returns the existing row
    assert LeaveBalanceLedger.objects.count() == 1


@pytest.mark.django_db
def test_append_without_reference_creates_distinct_rows(setup) -> None:
    """Manual adjustments (no reference) are NOT idempotent."""
    org, lt, emp_id = setup
    LeaveLedgerService.append(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("1"),
        reason="manual_adjustment",
    )
    LeaveLedgerService.append(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("2"),
        reason="manual_adjustment",
    )
    assert LeaveBalanceLedger.objects.count() == 2
