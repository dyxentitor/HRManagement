"""Identity, precedence and provisional-gate hardening tests.

These pin the correction made after review: `source_key` used to be a slug of
the *display name*, so "Prophet Muhammad's Birthday" (provider) and
"Maulidur Rasul" (gazette) minted two different keys and precedence silently
never fired.
"""

from __future__ import annotations

import datetime

import pytest
from django.core.management import call_command
from django.utils import timezone

from common.holidays.canonical import build_canonical_key, canonical_code
from modules.organization.holiday_import import import_country_holidays
from modules.organization.models import CountryHoliday, Organization
from modules.schedule.models import Holiday, published_holidays
from modules.schedule.services.holiday import (
    HolidayService,
    reconcile_org_holidays,
    resolve_reference_holidays,
)

pytestmark = pytest.mark.django_db

MAULIDUR_NAMES = [
    "Prophet Muhammad's Birthday",  # python-holidays, en_US
    "Maulidur Rasul",  # Cabinet gazette, short form
    "Hari Keputeraan Nabi Muhammad S.A.W.",  # gazette, Malay full form
    "Birthday of Prophet Muhammad",  # a plausible other provider's wording
]


def _org(slug: str, *, country: str = "MY", subdivision: str = "") -> Organization:
    return Organization.objects.create(
        name=slug.upper(),
        slug=slug,
        country_code=country,
        default_subdivision_code=subdivision,
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _key(name: str, *, year: int = 2026, subdivision: str | None = None) -> str:
    return build_canonical_key(
        country_code="MY", subdivision_code=subdivision, year=year, name=name
    )


# --- 1. provider name and official name resolve to one holiday --------------


def test_provider_and_official_names_resolve_to_one_identity() -> None:
    keys = {_key(name) for name in MAULIDUR_NAMES}
    assert len(keys) == 1, f"expected one canonical identity, got {keys}"
    assert keys.pop() == "MY:MY:2026:maulidur-rasul"


def test_official_override_by_gazette_name_outranks_provider_row() -> None:
    """The end-to-end case the old name-slug identity broke.

    The official row is authored with the Malay gazette name; it must still
    land on the provider row's identity and win.
    """
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    provider_row = CountryHoliday.objects.get(
        country_code="MY",
        date=datetime.date(2026, 8, 25),
        source=CountryHoliday.SOURCE_PROVIDER,
    )
    assert provider_row.name == "Prophet Muhammad's Birthday"

    CountryHoliday.objects.create(
        country_code="MY",
        date=datetime.date(2026, 8, 25),
        name="Hari Keputeraan Nabi Muhammad S.A.W.",  # different wording entirely
        type="federal",
        source_key=_key("Hari Keputeraan Nabi Muhammad S.A.W."),
        source=CountryHoliday.SOURCE_OFFICIAL,
        source_provider="https://www.kabinet.gov.my/hari-kelepasan-am/",
        retrieved_at=timezone.now(),
    )

    winners = resolve_reference_holidays(country_code="MY", year=2026)
    maulidur = [w for w in winners if w.source_key == provider_row.source_key]
    assert len(maulidur) == 1, "official and provider rows must collapse to ONE winner"
    assert maulidur[0].source == CountryHoliday.SOURCE_OFFICIAL


# --- 2. language switch must not fork identity ------------------------------


def test_language_switch_does_not_create_a_second_record() -> None:
    import_country_holidays(country_code="MY", year=2026, language="en_US", dry_run=False)
    before = CountryHoliday.objects.filter(
        country_code="MY", source=CountryHoliday.SOURCE_PROVIDER
    ).count()

    stats = import_country_holidays(country_code="MY", year=2026, language="ms_MY", dry_run=False)
    after = CountryHoliday.objects.filter(
        country_code="MY", source=CountryHoliday.SOURCE_PROVIDER
    ).count()

    assert stats.added == 0, "a language change must not add rows"
    assert after == before
    # The display name did change — only the identity held steady.
    row = CountryHoliday.objects.get(
        country_code="MY",
        date=datetime.date(2026, 8, 25),
        source=CountryHoliday.SOURCE_PROVIDER,
    )
    assert "Nabi Muhammad" in row.name


# --- 3. multi-day festivals stay separate -----------------------------------


def test_chinese_new_year_days_remain_two_distinct_holidays() -> None:
    assert canonical_code(country_code="MY", name="Chinese New Year") != canonical_code(
        country_code="MY", name="Chinese New Year (Second Day)"
    )
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    cny = CountryHoliday.objects.filter(
        country_code="MY",
        source=CountryHoliday.SOURCE_PROVIDER,
        date__in=[datetime.date(2026, 2, 17), datetime.date(2026, 2, 18)],
    )
    assert cny.count() == 2
    assert len({row.source_key for row in cny}) == 2


def test_identically_named_days_are_separated_by_occurrence() -> None:
    """Singapore lists two consecutive days both called "Chinese New Year"."""
    import_country_holidays(country_code="SG", year=2027, dry_run=False)
    rows = CountryHoliday.objects.filter(
        country_code="SG", name="Chinese New Year", withdrawn_at__isnull=True
    ).order_by("date")
    assert rows.count() == 2
    assert [r.occurrence for r in rows] == [1, 2]
    assert len({r.source_key for r in rows}) == 2


# --- 4. swapping providers must not duplicate -------------------------------


class _RivalProvider:
    """A second provider describing the same holidays in its own wording."""

    name = "rival-provider"

    def supports(self, *, country_code: str, subdivision_code: str | None = None) -> bool:
        return country_code == "MY"

    def fetch(self, *, country_code, year, subdivision_code=None, language=None, **_):
        from common.holidays.base import NormalizedHoliday
        from common.holidays.canonical import build_external_id

        rows = [
            ("Maulidur Rasul", datetime.date(2026, 8, 25)),
            ("Hari Kebangsaan", datetime.date(2026, 8, 31)),
        ]
        return [
            NormalizedHoliday(
                source_key=build_canonical_key(
                    country_code=country_code, subdivision_code=None, year=year, name=name
                ),
                external_id=build_external_id(
                    provider=self.name,
                    country_code=country_code,
                    subdivision_code=None,
                    year=year,
                    name=name,
                ),
                country_code=country_code,
                subdivision_code=None,
                date=date,
                name=name,
                holiday_type="federal",
                observed=False,
                provider=self.name,
                source_version="9.9",
                retrieved_at=timezone.now(),
            )
            for name, date in rows
        ]


def test_changing_provider_updates_rather_than_duplicates(monkeypatch) -> None:
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    key = _key("Maulidur Rasul")
    before = CountryHoliday.objects.get(source_key=key, source=CountryHoliday.SOURCE_PROVIDER)
    assert before.source_provider == "python-holidays"

    monkeypatch.setattr(
        "modules.organization.holiday_import.get_provider", lambda _name=None: _RivalProvider()
    )
    import_country_holidays(country_code="MY", year=2026, dry_run=False)

    rows = CountryHoliday.objects.filter(source_key=key, source=CountryHoliday.SOURCE_PROVIDER)
    assert rows.count() == 1, "a provider swap must not fork the holiday"
    after = rows.get()
    assert after.id == before.id
    assert after.source_provider == "rival-provider"
    # The provider's OWN identity is what changed — recorded, not matched on.
    assert after.external_id.startswith("rival-provider:")


# --- 5. a provider date correction updates the same record ------------------


def test_provider_date_correction_updates_the_same_record() -> None:
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    key = _key("Maulidur Rasul")
    row = CountryHoliday.objects.get(source_key=key, source=CountryHoliday.SOURCE_PROVIDER)
    original_id = row.id

    row.date = datetime.date(2026, 8, 26)  # pretend an earlier, wrong import
    row.save()

    stats = import_country_holidays(country_code="MY", year=2026, dry_run=False)
    assert stats.added == 0
    matches = CountryHoliday.objects.filter(source_key=key, source=CountryHoliday.SOURCE_PROVIDER)
    assert matches.count() == 1
    assert matches.get().id == original_id
    assert matches.get().date == datetime.date(2026, 8, 25)


# --- provisional publication gate -------------------------------------------


def test_provisional_holiday_is_absent_from_employee_calendar_until_confirmed() -> None:
    """The headline safety property: an unconfirmed date never reaches staff."""
    org = _org("acme")
    provisional_date = datetime.date(2027, 3, 10)
    CountryHoliday.objects.create(
        country_code="MY",
        date=provisional_date,
        name="Hari Raya Aidilfitri",
        type="federal",
        source_key=_key("Hari Raya Aidilfitri", year=2027),
        source=CountryHoliday.SOURCE_OFFICIAL,
        source_provider="https://www.kabinet.gov.my/hari-kelepasan-am/",
        provisional=True,
        retrieved_at=timezone.now(),
    )

    # 1. Default reconcile refuses to import it at all.
    stats = reconcile_org_holidays(org=org, year=2027, dry_run=False)
    assert stats.added == 0
    assert stats.skipped == 1
    assert any("provisional" in c for c in stats.conflicts)
    assert not HolidayService.is_holiday(org_id=org.id, on_date=provisional_date)

    # 2. Staged for review — present as a row, still invisible to employees.
    stats = reconcile_org_holidays(org=org, year=2027, dry_run=False, include_provisional=True)
    assert stats.added == 1
    row = Holiday.all_objects.get(org_id=org.id, date=provisional_date)
    assert row.provisional is True
    assert row.published is False
    assert not HolidayService.is_holiday(org_id=org.id, on_date=provisional_date)
    assert not published_holidays(org_id=org.id, date=provisional_date).exists()

    # 3. Only an explicit administrator confirmation publishes it.
    actor = org.id
    HolidayService.confirm(org_id=org.id, holiday_id=row.id, actor_id=actor)
    row.refresh_from_db()
    assert row.published is True
    assert row.confirmed_at is not None
    assert row.confirmed_by == actor
    assert HolidayService.is_holiday(org_id=org.id, on_date=provisional_date)


def test_reimport_does_not_unconfirm_an_administrator_decision() -> None:
    org = _org("acme")
    CountryHoliday.objects.create(
        country_code="MY",
        date=datetime.date(2027, 10, 28),
        name="Deepavali",
        type="federal",
        source_key=_key("Deepavali", year=2027),
        source=CountryHoliday.SOURCE_OFFICIAL,
        source_provider="https://www.kabinet.gov.my/hari-kelepasan-am/",
        provisional=True,
        retrieved_at=timezone.now(),
    )
    reconcile_org_holidays(org=org, year=2027, dry_run=False, include_provisional=True)
    row = Holiday.all_objects.get(org_id=org.id, date=datetime.date(2027, 10, 28))
    HolidayService.confirm(org_id=org.id, holiday_id=row.id, actor_id=org.id)

    reconcile_org_holidays(org=org, year=2027, dry_run=False, include_provisional=True)
    row.refresh_from_db()
    assert row.provisional is False, "a re-import must not revoke a confirmation"
    assert row.published is True


def test_provisional_day_is_hidden_from_the_employee_calendar_payload() -> None:
    from modules.schedule.services.calendar import build_calendar

    org = _org("acme")
    Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 7, 1),
        name="Unconfirmed Day",
        type="federal",
        source=Holiday.SOURCE_IMPORT,
        source_key="MY:MY:2026:unconfirmed-day",
        provisional=True,
    )
    Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 7, 2),
        name="Settled Day",
        type="federal",
        source=Holiday.SOURCE_IMPORT,
        source_key="MY:MY:2026:settled-day",
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=datetime.date(2026, 7, 1),
        date_to=datetime.date(2026, 7, 3),
    )
    names = {h["name"] for h in payload["holidays"]}
    assert "Settled Day" in names
    assert "Unconfirmed Day" not in names


# --- Malaysia correction ----------------------------------------------------


CORRECTIONS = [
    ("Chinese New Year", datetime.date(2026, 1, 29), datetime.date(2026, 2, 17)),
    ("Chinese New Year (Second Day)", datetime.date(2026, 1, 30), datetime.date(2026, 2, 18)),
    ("Wesak Day", datetime.date(2026, 5, 27), datetime.date(2026, 5, 31)),
    ("Hari Raya Aidiladha", datetime.date(2026, 5, 28), datetime.date(2026, 5, 27)),
    ("Yang di-Pertuan Agong's Birthday", datetime.date(2026, 6, 4), datetime.date(2026, 6, 1)),
    ("Maulidur Rasul", datetime.date(2026, 8, 26), datetime.date(2026, 8, 25)),
]


@pytest.mark.parametrize(("name", "wrong", "correct"), CORRECTIONS)
def test_official_data_corrects_each_wrong_legacy_date(name, wrong, correct) -> None:
    call_command("seed_country_reference_data", "--country", "MY")  # legacy, wrong
    call_command("load_official_holidays", "--country", "MY", "--apply")

    winners = {
        w.source_key: w
        for w in resolve_reference_holidays(country_code="MY", year=2026)
        if w.source_key
    }
    winner = winners[_key(name)]
    assert winner.date == correct, f"{name}: expected {correct}, got {winner.date}"
    assert winner.date != wrong
    assert winner.source == CountryHoliday.SOURCE_OFFICIAL


def test_official_2027_confirmed_dates_beat_provider_predictions() -> None:
    """The gazette disagrees with the package on three 2027 lunar dates."""
    import_country_holidays(country_code="MY", year=2027, dry_run=False)
    call_command("load_official_holidays", "--country", "MY", "--apply")

    winners = {
        w.source_key: w
        for w in resolve_reference_holidays(country_code="MY", year=2027)
        if w.source_key
    }
    # Unstarred in the gazette -> confirmed and publishable.
    maulidur = winners[_key("Maulidur Rasul", year=2027)]
    assert maulidur.date == datetime.date(2027, 8, 15)  # package predicted 08-14
    assert maulidur.provisional is False

    # Starred "tertakluk kepada perubahan" -> official but still provisional.
    aidilfitri = winners[_key("Hari Raya Aidilfitri", year=2027)]
    assert aidilfitri.date == datetime.date(2027, 3, 10)  # package predicted 03-09
    assert aidilfitri.provisional is True


def test_state_only_holidays_are_not_flattened_to_nationwide() -> None:
    call_command("load_official_holidays", "--country", "MY", "--apply")

    # Federal Territory Day is KL/Labuan/Putrajaya only.
    ft_rows = CountryHoliday.objects.filter(
        country_code="MY", name="Federal Territory Day", source=CountryHoliday.SOURCE_OFFICIAL
    )
    assert ft_rows.count() == 3
    assert not ft_rows.filter(subdivision_code="").exists(), "must never be nationwide"
    assert set(ft_rows.values_list("subdivision_code", flat=True)) == {
        "MY-14",
        "MY-15",
        "MY-16",
    }

    # Deepavali excludes Sarawak, so it is per-state and Sarawak is absent.
    deepavali = CountryHoliday.objects.filter(
        country_code="MY",
        name="Deepavali",
        date=datetime.date(2026, 11, 8),
        source=CountryHoliday.SOURCE_OFFICIAL,
    )
    assert deepavali.count() == 15
    assert not deepavali.filter(subdivision_code="MY-13").exists()
    assert not deepavali.filter(subdivision_code="").exists()


def test_a_national_only_org_does_not_inherit_state_holidays() -> None:
    call_command("load_official_holidays", "--country", "MY", "--apply")
    national = _org("national-only")  # no default_subdivision_code
    kl = _org("kl-org", subdivision="MY-14")

    reconcile_org_holidays(org=national, year=2026, dry_run=False)
    reconcile_org_holidays(org=kl, year=2026, dry_run=False)

    ft_day = datetime.date(2026, 2, 1)
    assert not HolidayService.is_holiday(org_id=national.id, on_date=ft_day)
    assert HolidayService.is_holiday(org_id=kl.id, on_date=ft_day)
