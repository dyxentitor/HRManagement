"""Chain selector tests — by amount band + override."""

from decimal import Decimal

from modules.claims.chains import (
    CLAIM_500_TO_5000,
    CLAIM_OVER_5000,
    CLAIM_UNDER_500,
    select_chain,
)


def test_under_500() -> None:
    assert select_chain(amount=Decimal("499.99")) is CLAIM_UNDER_500


def test_at_500_uses_500_to_5000() -> None:
    assert select_chain(amount=Decimal("500.00")) is CLAIM_500_TO_5000


def test_at_5000_uses_over_5000() -> None:
    assert select_chain(amount=Decimal("5000.00")) is CLAIM_OVER_5000


def test_override_wins() -> None:
    assert select_chain(amount=Decimal("1"), override_code="claim_over_5000") is CLAIM_OVER_5000


def test_unknown_override_falls_back_to_amount() -> None:
    assert select_chain(amount=Decimal("1"), override_code="bogus") is CLAIM_UNDER_500
