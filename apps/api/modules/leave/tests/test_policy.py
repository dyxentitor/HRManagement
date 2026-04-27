"""PolicyService.compute_entitled_days — tenure brackets."""

import datetime
from decimal import Decimal

import pytest

from modules.leave.models import LeavePolicy, LeaveType
from modules.leave.services.policy import PolicyService
from modules.organization.models import Organization


@pytest.fixture
def policy_with_brackets() -> LeavePolicy:
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
    return LeavePolicy.all_objects.create(
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


@pytest.mark.django_db
def test_compute_entitled_days_year_zero(policy_with_brackets) -> None:
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2026, 1, 1),
        as_of=datetime.date(2026, 6, 1),
    )
    assert days == Decimal("14")


@pytest.mark.django_db
def test_compute_entitled_days_year_three(policy_with_brackets) -> None:
    """Hired 3 years ago — should hit the 2-year bracket."""
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2023, 6, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("18")


@pytest.mark.django_db
def test_compute_entitled_days_year_seven(policy_with_brackets) -> None:
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2019, 6, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("21")


@pytest.mark.django_db
def test_compute_entitled_days_falls_back_to_days_per_year_if_no_brackets() -> None:
    org = Organization.objects.create(
        name="Y",
        slug="y",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="MEDICAL",
        name="Medical",
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
        tenure_brackets=[],  # empty
        effective_from=datetime.date(2026, 1, 1),
    )
    days = PolicyService.compute_entitled_days(
        policy=p,
        hire_date=datetime.date(2020, 1, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("14")
