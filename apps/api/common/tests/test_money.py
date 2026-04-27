"""Tests for common.money helpers."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from common.money import Money, format_money, validate_currency_code


def test_money_dataclass_round_trips() -> None:
    m = Money(amount=Decimal("123.4500"), currency_code="MYR")
    assert m.amount == Decimal("123.4500")
    assert m.currency_code == "MYR"


def test_money_rejects_more_than_4_decimal_places() -> None:
    with pytest.raises(ValueError):
        Money(amount=Decimal("1.23456"), currency_code="MYR")


def test_money_rejects_invalid_currency() -> None:
    with pytest.raises(ValueError):
        Money(amount=Decimal("1.00"), currency_code="myr")


def test_format_money_renders_locale_aware() -> None:
    m = Money(amount=Decimal("1234.5600"), currency_code="MYR")
    assert format_money(m) == "MYR 1,234.5600"


def test_validate_currency_code_accepts_known_iso_codes() -> None:
    for code in ("MYR", "USD", "SGD", "IDR", "PHP", "INR", "EUR", "GBP", "JPY"):
        validate_currency_code(code)


def test_validate_currency_code_rejects_unknown() -> None:
    with pytest.raises(ValidationError):
        validate_currency_code("ZZZ")
