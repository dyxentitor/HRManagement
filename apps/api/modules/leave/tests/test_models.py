"""LeaveType, LeavePolicy, LeaveBalance, LeaveBalanceLedger models."""

import datetime
from decimal import Decimal

import pytest
from django.db import IntegrityError

from modules.leave.models import (
    LeaveBalance,
    LeaveBalanceLedger,
    LeavePolicy,
    LeaveType,
)
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_leave_type_basic(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    assert lt.code == "ANNUAL"
    assert lt.is_paid is True


@pytest.mark.django_db
def test_leave_type_code_unique_per_org(org: Organization) -> None:
    LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    with pytest.raises(IntegrityError):
        LeaveType.all_objects.create(
            org_id=org.id,
            code="ANNUAL",
            name="Dup",
            accrual_type="annual",
            default_days=Decimal("10"),
            is_paid=True,
            is_statutory=False,
            gender_restriction="any",
        )


@pytest.mark.django_db
def test_leave_policy_with_tenure_brackets(org: Organization) -> None:
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
    p = LeavePolicy.all_objects.create(
        org_id=org.id,
        leave_type=lt,
        days_per_year=Decimal("14"),
        tenure_brackets=[
            {"min_years": 0, "days": 14},
            {"min_years": 2, "days": 18},
            {"min_years": 5, "days": 21},
        ],
        effective_from=datetime.date(2026, 1, 1),
    )
    assert len(p.tenure_brackets) == 3
    assert p.effective_to is None  # open-ended


@pytest.mark.django_db
def test_leave_balance_unique_per_employee_type_year(org: Organization) -> None:
    import uuid

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
    emp_id = uuid.uuid4()
    LeaveBalance.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        year=2026,
        entitled=Decimal("14"),
        accrued=Decimal("14"),
        taken=Decimal("0"),
        pending=Decimal("0"),
        carried_forward=Decimal("0"),
    )
    with pytest.raises(IntegrityError):
        LeaveBalance.all_objects.create(
            org_id=org.id,
            employee_id=emp_id,
            leave_type=lt,
            year=2026,
            entitled=Decimal("10"),
            accrued=Decimal("10"),
            taken=Decimal("0"),
            pending=Decimal("0"),
            carried_forward=Decimal("0"),
        )


@pytest.mark.django_db
def test_leave_balance_ledger_append(org: Organization) -> None:
    import uuid

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
    row = LeaveBalanceLedger.objects.create(
        org_id=org.id,
        employee_id=uuid.uuid4(),
        leave_type=lt,
        delta=Decimal("14"),
        reason="accrual",
    )
    assert row.delta == Decimal("14")
    assert row.reference_type is None


@pytest.mark.django_db
def test_leave_balance_ledger_idempotent_per_reference(org: Organization) -> None:
    import uuid

    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="REPLACEMENT",
        name="Replacement",
        accrual_type="event_based",
        default_days=Decimal("0"),
        is_paid=True,
        is_statutory=False,
        gender_restriction="any",
    )
    emp_id = uuid.uuid4()
    ref_id = uuid.uuid4()
    LeaveBalanceLedger.objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        delta=Decimal("1"),
        reason="holiday_replacement",
        reference_type="attendance_record",
        reference_id=ref_id,
    )
    with pytest.raises(IntegrityError):
        LeaveBalanceLedger.objects.create(
            org_id=org.id,
            employee_id=emp_id,
            leave_type=lt,
            delta=Decimal("1"),
            reason="holiday_replacement",
            reference_type="attendance_record",
            reference_id=ref_id,
        )
