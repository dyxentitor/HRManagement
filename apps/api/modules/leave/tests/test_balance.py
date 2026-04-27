"""BalanceService — recompute, accrue, hold, release, deduct."""

import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
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
def test_get_or_create_creates_zero_balance(setup) -> None:
    org, lt, emp_id = setup
    bal = BalanceService.get_or_create(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026)
    assert bal.entitled == Decimal("0")
    assert bal.accrued == Decimal("0")
    assert bal.available == Decimal("0")


@pytest.mark.django_db
def test_accrue_increments_accrued_and_appends_ledger(setup) -> None:
    org, lt, emp_id = setup
    bal = BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    assert bal.accrued == Decimal("14")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_hold_pending_reduces_available(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    bal = BalanceService.hold_pending(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("3"),
    )
    assert bal.pending == Decimal("3")
    assert bal.available == Decimal("11")


@pytest.mark.django_db
def test_deduct_moves_pending_to_taken(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    BalanceService.hold_pending(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("3"),
    )
    ref_id = uuid.uuid4()
    bal = BalanceService.deduct(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("3"),
        reference_type="leave_request",
        reference_id=ref_id,
    )
    assert bal.pending == Decimal("0")
    assert bal.taken == Decimal("3")
    assert bal.available == Decimal("11")


@pytest.mark.django_db
def test_release_pending_restores_available(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    BalanceService.hold_pending(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("3"),
    )
    bal = BalanceService.release_pending(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("3"),
    )
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_grant_replacement_idempotent_per_reference(setup) -> None:
    """The HolidayWorkConfirmed replacement-grant is idempotent on (ref_type, ref_id, reason)."""
    org, lt, emp_id = setup
    ref_id = uuid.uuid4()
    bal1 = BalanceService.grant_replacement(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("1"),
        reference_type="attendance_record",
        reference_id=ref_id,
    )
    bal2 = BalanceService.grant_replacement(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        days=Decimal("1"),
        reference_type="attendance_record",
        reference_id=ref_id,
    )
    assert bal1.accrued == bal2.accrued == Decimal("1")  # not 2
