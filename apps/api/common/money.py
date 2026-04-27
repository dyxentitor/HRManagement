"""Money helpers — value type, validators, formatters."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import ValidationError

# Subset of ISO 4217 we support today. Expand as countries are added.
SUPPORTED_CURRENCIES: frozenset[str] = frozenset(
    {"MYR", "USD", "SGD", "IDR", "PHP", "INR", "EUR", "GBP", "JPY"}
)


def validate_currency_code(code: str) -> None:
    if code not in SUPPORTED_CURRENCIES:
        raise ValidationError(
            f"{code!r} is not a supported ISO 4217 currency code",
            code="invalid_currency",
        )


@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency_code: str

    def __post_init__(self) -> None:
        if not isinstance(self.amount, Decimal):
            raise TypeError("amount must be Decimal")
        if self.amount.as_tuple().exponent < -4:
            raise ValueError("amount precision exceeds 4 decimal places")
        if self.currency_code != self.currency_code.upper() or len(self.currency_code) != 3:
            raise ValueError("currency_code must be a 3-letter uppercase ISO 4217 code")
        if self.currency_code not in SUPPORTED_CURRENCIES:
            raise ValueError(f"unsupported currency: {self.currency_code}")


def format_money(m: Money) -> str:
    """Render as 'CCY 1,234.5678' for logs/PDFs. UI formatting goes through Intl."""
    return f"{m.currency_code} {m.amount:,.4f}"
