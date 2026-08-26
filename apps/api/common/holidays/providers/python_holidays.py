"""`python-holidays` adapter — the first concrete HolidayProvider.

This is the ONLY module in the codebase permitted to import `holidays`.
It is a pure reader: no Django, no DB.
"""

from __future__ import annotations

import datetime
import re

import holidays
from django.utils import timezone

from ..base import (
    HOLIDAY_TYPE_NATIONAL,
    HOLIDAY_TYPE_SUBDIVISION,
    NormalizedHoliday,
    ProviderNotAvailableError,
)
from ..canonical import build_canonical_key, build_external_id, canonical_code
from ..iso import normalize_country_code, normalize_subdivision_code, subdivision_part

PROVIDER_NAME = "python-holidays"

# The package localizes names; we anchor identity on English so a language
# switch cannot fork a holiday's `source_key`.
_IDENTITY_LANGUAGE = "en_US"

# Upstream marks a substitute/observed day by suffixing the name.
_OBSERVED_MARKERS = ("(observed)", "(estimated)")


def _registry_entry(country_code: str):
    entry = getattr(holidays, country_code, None)
    if entry is None or not hasattr(entry, "subdivisions"):
        raise ProviderNotAvailableError(
            f"{PROVIDER_NAME} has no calendar for country {country_code!r}"
        )
    return entry


def _pick_language(entry, requested: str | None) -> str | None:
    """Honour `language` only when upstream actually supports it."""
    supported = getattr(entry, "supported_languages", ()) or ()
    if requested and requested in supported:
        return requested
    if _IDENTITY_LANGUAGE in supported:
        return _IDENTITY_LANGUAGE
    return None


class PythonHolidaysProvider:
    """Adapter over the MIT-licensed `holidays` package."""

    name = PROVIDER_NAME

    @property
    def version(self) -> str:
        return holidays.__version__

    def supports(self, *, country_code: str, subdivision_code: str | None = None) -> bool:
        try:
            country = normalize_country_code(country_code)
            subdivision = normalize_subdivision_code(subdivision_code, country_code=country)
            entry = _registry_entry(country)
        except (ProviderNotAvailableError, ValueError):
            return False
        if subdivision is None:
            return True
        return subdivision_part(subdivision) in set(entry.subdivisions)

    def fetch(
        self,
        *,
        country_code: str,
        year: int,
        subdivision_code: str | None = None,
        language: str | None = None,
        include_observed: bool = True,
    ) -> list[NormalizedHoliday]:
        country = normalize_country_code(country_code)
        subdivision = normalize_subdivision_code(subdivision_code, country_code=country)
        entry = _registry_entry(country)

        subdiv = subdivision_part(subdivision)
        if subdiv is not None and subdiv not in set(entry.subdivisions):
            raise ProviderNotAvailableError(
                f"{PROVIDER_NAME} has no subdivision {subdivision!r} for {country!r}"
            )

        retrieved_at = timezone.now()
        version = self.version

        # Identity always resolved in English; display name may be localized.
        identity_names = self._collect(entry, country, subdiv, year, _pick_language(entry, None))
        display_names = (
            self._collect(entry, country, subdiv, year, _pick_language(entry, language))
            if language
            else identity_names
        )

        records: list[NormalizedHoliday] = []
        seen_occurrences: dict[str, int] = {}
        for date, identity_name in sorted(identity_names.items()):
            observed = self._is_observed(identity_name)
            if observed and not include_observed:
                continue
            display = display_names.get(date, identity_name)

            # Some calendars name repeated days identically (Singapore lists two
            # consecutive "Chinese New Year" days with no ordinal). Occurrence
            # keeps them distinct; it is counted against the CANONICAL code so
            # that e.g. "Chinese New Year" and "Tahun Baharu Cina" on the same
            # day would collide rather than each claim occurrence 1.
            code = canonical_code(country_code=country, name=identity_name)
            occurrence = seen_occurrences.get(code, 0) + 1
            seen_occurrences[code] = occurrence

            records.append(
                NormalizedHoliday(
                    source_key=build_canonical_key(
                        country_code=country,
                        subdivision_code=subdivision,
                        year=year,
                        name=identity_name,
                        occurrence=occurrence,
                    ),
                    external_id=build_external_id(
                        provider=self.name,
                        country_code=country,
                        subdivision_code=subdivision,
                        year=year,
                        name=identity_name,
                        occurrence=occurrence,
                    ),
                    occurrence=occurrence,
                    country_code=country,
                    subdivision_code=subdivision,
                    date=date,
                    name=self._clean_name(display),
                    holiday_type=(
                        HOLIDAY_TYPE_SUBDIVISION if subdivision else HOLIDAY_TYPE_NATIONAL
                    ),
                    observed=observed,
                    provider=self.name,
                    source_version=version,
                    retrieved_at=retrieved_at,
                    # The package computes lunar/Islamic dates astronomically;
                    # Malaysia (and others) only fix them by gazette. Anything
                    # upstream flags "estimated" is surfaced as provisional
                    # rather than presented as settled fact.
                    provisional="(estimated)" in identity_name.lower(),
                )
            )
        return records

    @staticmethod
    def _collect(
        entry, country: str, subdiv: str | None, year: int, language: str | None
    ) -> dict[datetime.date, str]:
        kwargs: dict = {"years": year}
        if subdiv is not None:
            kwargs["subdiv"] = subdiv
        if language is not None:
            kwargs["language"] = language
        return dict(holidays.country_holidays(country, **kwargs).items())

    @staticmethod
    def _is_observed(name: str) -> bool:
        lowered = name.lower()
        return "(observed)" in lowered or "observed," in lowered

    @staticmethod
    def _clean_name(name: str) -> str:
        """Strip upstream's confidence marker from the display name.

        `"Chinese New Year (estimated)"` is a statement about our certainty,
        not part of the holiday's name — it is carried in `provisional`
        instead, so the calendar shows a clean label.
        """
        cleaned = re.sub(r"\s*\(([^)]*\bestimated\b[^)]*)\)", "", name, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*\(\s*\)", "", cleaned)
        return cleaned.strip() or name.strip()
