"""Provider registry — the single place a new provider is wired in.

Adding Calendarific / Nager.Date / Timeanddate later means writing one adapter
and appending one line here. No calendar, leave, attendance or payroll module
changes.
"""

from __future__ import annotations

from .base import HolidayProvider
from .providers.python_holidays import PROVIDER_NAME as PYTHON_HOLIDAYS
from .providers.python_holidays import PythonHolidaysProvider

DEFAULT_PROVIDER = PYTHON_HOLIDAYS

_PROVIDERS: dict[str, type] = {
    PYTHON_HOLIDAYS: PythonHolidaysProvider,
}


class UnknownProviderError(KeyError):
    """Raised when a provider name is not registered."""


def available_providers() -> list[str]:
    return sorted(_PROVIDERS)


def get_provider(name: str | None = None) -> HolidayProvider:
    key = name or DEFAULT_PROVIDER
    try:
        return _PROVIDERS[key]()
    except KeyError as exc:
        raise UnknownProviderError(
            f"Unknown holiday provider {key!r}. Available: {', '.join(available_providers())}"
        ) from exc
