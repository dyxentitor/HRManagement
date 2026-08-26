"""Provider-layer tests — normalization and ISO handling.

These touch no database and no Django models; the provider layer is a pure
reader by design.
"""

from __future__ import annotations

import datetime

import pytest

from common.holidays import (
    NormalizedHoliday,
    ProviderNotAvailableError,
    UnknownProviderError,
    build_source_key,
    get_provider,
    slugify_holiday_name,
)
from common.holidays.iso import (
    InvalidJurisdictionError,
    normalize_country_code,
    normalize_subdivision_code,
    subdivision_part,
)

# --- ISO 3166 handling ------------------------------------------------------


@pytest.mark.parametrize(("raw", "expected"), [("my", "MY"), ("MY", "MY"), (" sg ", "SG")])
def test_country_code_normalizes_to_alpha2(raw: str, expected: str) -> None:
    assert normalize_country_code(raw) == expected


@pytest.mark.parametrize("bad", ["MYS", "M", "", "1Y", None])
def test_country_code_rejects_non_alpha2(bad) -> None:
    with pytest.raises(InvalidJurisdictionError):
        normalize_country_code(bad)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("MY-10", "MY-10"), ("10", "MY-10"), ("my-10", "MY-10"), (None, None), ("", None)],
)
def test_subdivision_accepts_bare_or_full_form(raw, expected) -> None:
    assert normalize_subdivision_code(raw, country_code="MY") == expected


def test_subdivision_rejects_cross_country_code() -> None:
    """`SG-01` under country MY is a mistake, not something to silently re-home."""
    with pytest.raises(InvalidJurisdictionError):
        normalize_subdivision_code("SG-01", country_code="MY")


def test_subdivision_part_strips_country_prefix() -> None:
    assert subdivision_part("MY-10") == "10"
    assert subdivision_part(None) is None


# --- identity ---------------------------------------------------------------


def test_slug_folds_punctuation_and_accents() -> None:
    assert slugify_holiday_name("Hari Raya Puasa (Second Day)") == "hari-raya-puasa-second-day"
    assert slugify_holiday_name("Hari Raya Puasa - second day") == "hari-raya-puasa-second-day"
    assert slugify_holiday_name("Fête Nationale") == "fete-nationale"


def test_source_key_excludes_date_and_provider() -> None:
    """Identity must survive both a date move and a provider swap."""
    a = build_source_key(country_code="MY", subdivision_code="MY-10", year=2026, name="Wesak Day")
    b = build_source_key(country_code="MY", subdivision_code="MY-10", year=2026, name="Wesak day")
    assert a == b == "MY:MY-10:2026:wesak-day"


def test_source_key_is_scoped_by_subdivision_and_year() -> None:
    national = build_source_key(
        country_code="MY", subdivision_code=None, year=2026, name="Wesak Day"
    )
    selangor = build_source_key(
        country_code="MY", subdivision_code="MY-10", year=2026, name="Wesak Day"
    )
    next_year = build_source_key(
        country_code="MY", subdivision_code=None, year=2027, name="Wesak Day"
    )
    assert len({national, selangor, next_year}) == 3


# --- provider registry ------------------------------------------------------


def test_unknown_provider_raises() -> None:
    with pytest.raises(UnknownProviderError):
        get_provider("calendarific")


def test_default_provider_supports_my_and_sg() -> None:
    provider = get_provider()
    assert provider.supports(country_code="MY")
    assert provider.supports(country_code="MY", subdivision_code="MY-10")
    assert provider.supports(country_code="SG")


def test_provider_rejects_unknown_subdivision() -> None:
    provider = get_provider()
    assert not provider.supports(country_code="MY", subdivision_code="MY-99")
    with pytest.raises(ProviderNotAvailableError):
        provider.fetch(country_code="MY", year=2026, subdivision_code="MY-99")


# --- normalization ----------------------------------------------------------


def test_fetch_returns_normalized_records_not_provider_objects() -> None:
    records = get_provider().fetch(country_code="MY", year=2026, language="en_US")
    assert records
    assert all(isinstance(r, NormalizedHoliday) for r in records)
    sample = records[0]
    assert isinstance(sample.date, datetime.date)
    # date-only: a `datetime` would silently carry a timezone into the DB.
    assert not isinstance(sample.date, datetime.datetime)
    assert sample.provider == "python-holidays"
    assert sample.source_version
    assert sample.country_code == "MY"


def test_normalized_record_is_immutable() -> None:
    record = get_provider().fetch(country_code="SG", year=2026)[0]
    with pytest.raises((AttributeError, TypeError)):
        record.date = datetime.date(2000, 1, 1)  # type: ignore[misc]


def test_source_keys_unique_within_a_fetch() -> None:
    """Singapore names two consecutive CNY days identically — must not collide."""
    records = get_provider().fetch(country_code="SG", year=2027, language="en_US")
    keys = [r.source_key for r in records]
    assert len(keys) == len(set(keys))
    cny = sorted(r.date for r in records if r.name.startswith("Chinese New Year"))
    assert len(cny) >= 2


def test_estimated_marker_becomes_provisional_flag_not_part_of_name() -> None:
    """Upstream's confidence marker is metadata, not the holiday's name."""
    records = get_provider().fetch(country_code="MY", year=2027, language="en_US")
    provisional = [r for r in records if r.provisional]
    assert provisional, "MY 2027 lunar dates are estimated upstream"
    assert all("estimated" not in r.name.lower() for r in records)


def test_observed_days_can_be_excluded() -> None:
    with_observed = get_provider().fetch(country_code="SG", year=2027, include_observed=True)
    without = get_provider().fetch(country_code="SG", year=2027, include_observed=False)
    assert any(r.observed for r in with_observed)
    assert not any(r.observed for r in without)
    assert len(without) < len(with_observed)


def test_language_changes_display_name_but_not_identity() -> None:
    """A language switch must not fork a holiday's identity."""
    english = get_provider().fetch(country_code="MY", year=2026, language="en_US")
    malay = get_provider().fetch(country_code="MY", year=2026, language="ms_MY")

    by_key_en = {r.source_key: r for r in english}
    by_key_ms = {r.source_key: r for r in malay}
    assert set(by_key_en) == set(by_key_ms)

    key = next(k for k in by_key_en if "christmas" in k)
    assert by_key_en[key].name != by_key_ms[key].name
    assert by_key_en[key].date == by_key_ms[key].date
