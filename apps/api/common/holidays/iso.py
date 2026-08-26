"""ISO 3166 normalization helpers.

We speak ISO 3166-1 alpha-2 (`MY`) and ISO 3166-2 (`MY-10`) at every boundary
we own — DB columns, management-command flags, API payloads. Upstream
providers mostly use the bare subdivision part (`10`), so the translation is
confined to these two functions.
"""

from __future__ import annotations

import re

_ALPHA2 = re.compile(r"^[A-Z]{2}$")
_SUBDIVISION = re.compile(r"^[A-Z]{2}-[A-Z0-9]{1,3}$")


class InvalidJurisdictionError(ValueError):
    """Raised for a malformed country or subdivision code."""


def normalize_country_code(code: str) -> str:
    """`'my'` -> `'MY'`. Raises on anything that is not alpha-2."""
    candidate = (code or "").strip().upper()
    if not _ALPHA2.match(candidate):
        raise InvalidJurisdictionError(f"Not an ISO 3166-1 alpha-2 country code: {code!r}")
    return candidate


def normalize_subdivision_code(code: str | None, *, country_code: str) -> str | None:
    """Return a full ISO 3166-2 code, or None.

    Accepts either the full form (`MY-10`) or the bare part (`10`) and always
    returns the full form, so the stored value is unambiguous. A full code
    whose country prefix disagrees with `country_code` is an error rather than
    a silent re-home.
    """
    if code is None or not str(code).strip():
        return None
    country = normalize_country_code(country_code)
    candidate = str(code).strip().upper()

    if "-" not in candidate:
        candidate = f"{country}-{candidate}"

    if not _SUBDIVISION.match(candidate):
        raise InvalidJurisdictionError(f"Not an ISO 3166-2 subdivision code: {code!r}")
    if not candidate.startswith(f"{country}-"):
        raise InvalidJurisdictionError(
            f"Subdivision {candidate!r} does not belong to country {country!r}"
        )
    return candidate


def subdivision_part(code: str | None) -> str | None:
    """`'MY-10'` -> `'10'`. The form most upstream providers expect."""
    if not code:
        return None
    return code.split("-", 1)[1]
