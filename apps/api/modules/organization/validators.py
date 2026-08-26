"""Validators for organization-level holiday-calendar settings."""

from __future__ import annotations

from django.core.exceptions import ValidationError

from common.holidays import get_provider
from common.holidays.iso import InvalidJurisdictionError, normalize_subdivision_code


def validate_default_subdivision(*, country_code: str, subdivision_code: str | None) -> str:
    """Normalize and validate an org's default holiday subdivision.

    Blank is always valid and means "national holidays only" — a safe
    fallback, not an error. Anything non-blank must be a real ISO 3166-2
    subdivision that belongs to the org's own country.
    """
    if not (subdivision_code or "").strip():
        return ""

    try:
        normalized = normalize_subdivision_code(subdivision_code, country_code=country_code)
    except InvalidJurisdictionError as exc:
        raise ValidationError(str(exc)) from exc

    # A syntactically valid code that no calendar knows about is still wrong.
    if not get_provider().supports(country_code=country_code, subdivision_code=normalized):
        raise ValidationError(f"{normalized} is not a recognised subdivision of {country_code}.")
    return normalized or ""
