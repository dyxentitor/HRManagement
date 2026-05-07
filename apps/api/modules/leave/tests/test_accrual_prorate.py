"""§60E by-month proration for new joiners."""

from datetime import date
from decimal import Decimal

import pytest

from modules.leave.services.accrual import prorate_for_hire_date


@pytest.mark.parametrize(
    "hire_month,expected",
    [
        (1, Decimal("12.0")),  # hired in Jan → full year
        (4, Decimal("9.0")),  # hired in Apr → 9 months
        (7, Decimal("6.0")),  # hired in Jul → 6 months
        (12, Decimal("1.0")),  # hired in Dec → 1 month
    ],
)
def test_prorate_current_year_hire(hire_month: int, expected: Decimal) -> None:
    result = prorate_for_hire_date(
        entitlement=Decimal("12"),
        hire_date=date(2026, hire_month, 15),
        year=2026,
    )
    assert result == expected


def test_prorate_prior_year_hire_no_proration() -> None:
    """Hired before the year being computed → full entitlement."""
    result = prorate_for_hire_date(
        entitlement=Decimal("16"),
        hire_date=date(2024, 7, 1),
        year=2026,
    )
    assert result == Decimal("16")


def test_prorate_future_hire_returns_zero() -> None:
    result = prorate_for_hire_date(
        entitlement=Decimal("12"),
        hire_date=date(2027, 1, 1),
        year=2026,
    )
    assert result == Decimal("0")


def test_prorate_rounds_to_nearest_half() -> None:
    """16 days * 7/12 = 9.333... rounds to nearest 0.5 = 9.5."""
    result = prorate_for_hire_date(
        entitlement=Decimal("16"),
        hire_date=date(2026, 6, 15),  # months_remaining = 13 - 6 = 7
        year=2026,
    )
    assert result == Decimal("9.5")
