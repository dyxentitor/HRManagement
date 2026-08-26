"""Provider-independent holiday contracts.

Nothing in this module knows about a specific country or a specific upstream
package. Calendar / leave / attendance / payroll code depends on
`NormalizedHoliday` only — never on a provider SDK.
"""

from __future__ import annotations

import datetime
import re
import unicodedata
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

# Mirrors schedule.models.HOLIDAY_TYPES minus "company" (providers never emit
# company holidays — those are tenant-authored).
HOLIDAY_TYPE_NATIONAL = "federal"
HOLIDAY_TYPE_SUBDIVISION = "state"

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
# Dropped outright rather than treated as separators, so "Muhammad's" slugs to
# "muhammads" and not "muhammad-s". Includes the curly apostrophe and the dots
# in initialisms like "S.A.W.".
# RUF001 is suppressed below because the curly quotes ARE the literal
# characters being stripped; "normalising" them would defeat the pattern.
_SLUG_DROP = re.compile(r"['‘’ʼ.]")  # noqa: RUF001


def slugify_holiday_name(name: str) -> str:
    """Stable slug for a holiday name.

    Deliberately aggressive: accents folded, apostrophes and abbreviation dots
    removed, remaining punctuation collapsed. `"Hari Raya Puasa (Second Day)"`
    and `"Hari Raya Puasa - second day"` both become
    `hari-raya-puasa-second-day`.

    NOTE: a slug is a normalization step, NOT an identity. Two spellings of the
    same holiday still produce two different slugs. Identity is resolved in
    `canonical.py`; use `build_canonical_key()` for anything durable.
    """
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    without_apostrophes = _SLUG_DROP.sub("", ascii_only)
    return _SLUG_STRIP.sub("-", without_apostrophes.lower()).strip("-")


def build_source_key(
    *,
    country_code: str,
    subdivision_code: str | None,
    year: int,
    name: str,
    occurrence: int = 1,
) -> str:
    """Deprecated shim — use `canonical.build_canonical_key()`.

    Kept only so older call sites keep importing cleanly. It now delegates to
    the canonical resolver, because the original name-slug implementation was
    wrong: "Prophet Muhammad's Birthday" and "Maulidur Rasul" minted two
    different keys for one holiday, which quietly defeated source precedence.
    """
    from .canonical import build_canonical_key

    return build_canonical_key(
        country_code=country_code,
        subdivision_code=subdivision_code,
        year=year,
        name=name,
        occurrence=occurrence,
    )


@dataclass(frozen=True, slots=True)
class NormalizedHoliday:
    """One holiday occurrence, normalized away from any provider's shape.

    Four distinct concepts, deliberately not conflated:

    * `source_key`   — internal canonical identity. Survives renames, language
                       switches, provider swaps and date corrections.
    * `external_id`  — the provider's own identity, kept verbatim for audit.
    * `name`         — display text only. Never an identifier.
    * `occurrence`   — which day of a multi-day festival this is, so two days
                       named identically stay two rows.
    """

    source_key: str
    external_id: str
    country_code: str
    subdivision_code: str | None
    date: datetime.date
    name: str
    holiday_type: str
    observed: bool
    provider: str
    source_version: str
    retrieved_at: datetime.datetime
    occurrence: int = 1
    provisional: bool = False

    @property
    def year(self) -> int:
        return self.date.year


class ProviderNotAvailableError(RuntimeError):
    """Raised when a provider cannot serve the requested jurisdiction/year."""


@runtime_checkable
class HolidayProvider(Protocol):
    """The seam a future Calendarific / Nager.Date / Timeanddate slots into.

    Implementations must be pure readers: no DB writes, no Django imports.
    """

    name: str

    def supports(self, *, country_code: str, subdivision_code: str | None = None) -> bool:
        """True when this provider can serve the jurisdiction."""
        ...

    def fetch(
        self,
        *,
        country_code: str,
        year: int,
        subdivision_code: str | None = None,
        language: str | None = None,
        include_observed: bool = True,
    ) -> list[NormalizedHoliday]:
        """Return normalized records. Must not raise on an empty result set."""
        ...
