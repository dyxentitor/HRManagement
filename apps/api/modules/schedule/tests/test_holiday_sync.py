"""Import, precedence, idempotency and tenant-isolation tests for holiday sync."""

from __future__ import annotations

import datetime

import pytest
from django.core.management import call_command
from django.utils import timezone

from common.holidays import build_source_key
from modules.organization.holiday_import import import_country_holidays
from modules.organization.models import CountryHoliday, Organization
from modules.schedule.models import Holiday
from modules.schedule.services.holiday import (
    HolidayService,
    reconcile_org_holidays,
    resolve_reference_holidays,
)

pytestmark = pytest.mark.django_db


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


# --- reference import -------------------------------------------------------


def test_malaysia_subdivision_import_includes_state_holiday() -> None:
    stats = import_country_holidays(
        country_code="MY", year=2026, subdivision_code="MY-10", dry_run=False
    )
    assert stats.added > 0
    rows = CountryHoliday.objects.filter(country_code="MY", subdivision_code="MY-10")
    # Sultan of Selangor's Birthday is a MY-10-only day; its presence proves
    # the subdivision was actually honoured rather than silently ignored.
    assert rows.filter(date=datetime.date(2026, 12, 11)).exists()
    assert rows.filter(date=datetime.date(2026, 8, 25)).exists()  # Maulidur Rasul


def test_singapore_import_proves_no_malaysia_specific_logic() -> None:
    stats = import_country_holidays(country_code="SG", year=2026, dry_run=False)
    assert stats.added > 0
    rows = CountryHoliday.objects.filter(country_code="SG")
    assert rows.filter(date=datetime.date(2026, 8, 9)).exists()  # SG National Day
    assert not rows.filter(subdivision_code="MY-10").exists()


def test_dry_run_writes_nothing_but_reports_counts() -> None:
    stats = import_country_holidays(country_code="SG", year=2026, dry_run=True)
    assert stats.added > 0
    assert CountryHoliday.objects.filter(country_code="SG").count() == 0


def test_repeated_import_is_idempotent() -> None:
    first = import_country_holidays(country_code="SG", year=2026, dry_run=False)
    count_after_first = CountryHoliday.objects.filter(country_code="SG").count()

    second = import_country_holidays(country_code="SG", year=2026, dry_run=False)
    assert second.added == 0
    assert second.updated == 0
    assert second.unchanged == first.added
    assert CountryHoliday.objects.filter(country_code="SG").count() == count_after_first


def test_moved_holiday_updates_in_place_without_duplicating() -> None:
    """The regression that motivated `source_key`.

    The legacy `(country_code, date, name)` key made a moved holiday insert a
    second row and orphan the first.
    """
    import_country_holidays(country_code="SG", year=2026, dry_run=False)
    row = CountryHoliday.objects.get(
        country_code="SG", date=datetime.date(2026, 12, 25), source=CountryHoliday.SOURCE_PROVIDER
    )
    original_key, original_id = row.source_key, row.id

    # Simulate upstream moving the date.
    row.date = datetime.date(2026, 12, 24)
    row.save()

    stats = import_country_holidays(country_code="SG", year=2026, dry_run=False)
    assert stats.added == 0
    assert stats.updated == 1

    matches = CountryHoliday.objects.filter(source_key=original_key)
    assert matches.count() == 1
    restored = matches.get()
    assert restored.id == original_id
    assert restored.date == datetime.date(2026, 12, 25)


def test_withdrawn_rows_are_flagged_not_deleted() -> None:
    import_country_holidays(country_code="SG", year=2026, dry_run=False)
    stale = CountryHoliday.objects.create(
        country_code="SG",
        date=datetime.date(2026, 6, 1),
        name="Abolished Day",
        type="federal",
        source_key="SG:SG:2026:abolished-day",
        source=CountryHoliday.SOURCE_PROVIDER,
        source_provider="python-holidays",
    )
    stats = import_country_holidays(country_code="SG", year=2026, dry_run=False)
    assert stats.withdrawn == 1
    stale.refresh_from_db()
    assert stale.withdrawn_at is not None


# --- precedence -------------------------------------------------------------


def test_official_override_outranks_provider_data() -> None:
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    key = build_source_key(
        country_code="MY", subdivision_code=None, year=2026, name="Prophet Muhammad's Birthday"
    )
    provider_row = CountryHoliday.objects.get(source_key=key, source=CountryHoliday.SOURCE_PROVIDER)

    CountryHoliday.objects.create(
        country_code="MY",
        date=datetime.date(2026, 8, 24),
        name="Prophet Muhammad's Birthday",
        type="federal",
        source_key=key,
        source=CountryHoliday.SOURCE_OFFICIAL,
        source_provider="https://www.kabinet.gov.my/hari-kelepasan-am/",
        retrieved_at=timezone.now(),
    )

    winners = {h.source_key: h for h in resolve_reference_holidays(country_code="MY", year=2026)}
    assert winners[key].source == CountryHoliday.SOURCE_OFFICIAL
    assert winners[key].date == datetime.date(2026, 8, 24)
    # The provider row survives for audit; it just loses.
    provider_row.refresh_from_db()
    assert provider_row.date == datetime.date(2026, 8, 25)


def test_legacy_fixture_loses_to_provider_import() -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    legacy = CountryHoliday.objects.filter(source=CountryHoliday.SOURCE_LEGACY)
    assert legacy.exists()

    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    winners = resolve_reference_holidays(country_code="MY", year=2026)
    keyed = [w for w in winners if w.source_key]
    assert keyed
    assert all(w.source == CountryHoliday.SOURCE_PROVIDER for w in keyed)


def test_national_holidays_apply_without_subdivision_but_state_ones_do_not() -> None:
    import_country_holidays(country_code="MY", year=2026, subdivision_code="MY-10", dry_run=False)
    national_only = resolve_reference_holidays(country_code="MY", year=2026)
    assert not any(h.subdivision_code == "MY-10" for h in national_only)

    with_state = resolve_reference_holidays(country_code="MY", year=2026, subdivision_code="MY-10")
    assert any(h.subdivision_code == "MY-10" for h in with_state)


# --- org reconcile ----------------------------------------------------------


def test_reconcile_populates_org_and_is_idempotent() -> None:
    org = _org("acme", subdivision="MY-10")
    import_country_holidays(country_code="MY", year=2026, subdivision_code="MY-10", dry_run=False)

    first = reconcile_org_holidays(org=org, year=2026, dry_run=False)
    assert first.added > 0
    count = Holiday.all_objects.filter(org_id=org.id, deleted_at__isnull=True).count()

    second = reconcile_org_holidays(org=org, year=2026, dry_run=False)
    assert second.added == 0
    assert second.updated == 0
    assert Holiday.all_objects.filter(org_id=org.id, deleted_at__isnull=True).count() == count


def test_org_created_holiday_is_never_touched_by_import() -> None:
    org = _org("acme")
    company_day = Holiday.all_objects.create(
        org_id=org.id,
        date=datetime.date(2026, 7, 1),
        name="Acme Founders Day",
        type="company",
        source=Holiday.SOURCE_COMPANY,
    )
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org, year=2026, dry_run=False)

    company_day.refresh_from_db()
    assert company_day.deleted_at is None
    assert company_day.date == datetime.date(2026, 7, 1)
    assert company_day.source == Holiday.SOURCE_COMPANY


def test_org_override_survives_reconcile_and_is_reported_as_conflict() -> None:
    org = _org("acme")
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org, year=2026, dry_run=False)

    row = Holiday.all_objects.get(org_id=org.id, date=datetime.date(2026, 8, 25))
    row.source = Holiday.SOURCE_OVERRIDE
    row.date = datetime.date(2026, 8, 24)
    row.name = "Maulidur Rasul (gazetted)"
    row.save()

    stats = reconcile_org_holidays(org=org, year=2026, dry_run=False)
    row.refresh_from_db()
    assert row.date == datetime.date(2026, 8, 24)
    assert stats.skipped >= 1
    assert any("org-owned" in c for c in stats.conflicts)


def test_company_exclusion_blocks_reimport_of_that_day() -> None:
    org = _org("acme")
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org, year=2026, dry_run=False)

    row = Holiday.all_objects.get(org_id=org.id, date=datetime.date(2026, 12, 25))
    row.excluded = True
    row.save()

    reconcile_org_holidays(org=org, year=2026, dry_run=False)
    row.refresh_from_db()
    assert row.excluded is True
    assert not HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 12, 25))


def test_published_history_is_not_moved_under_attendance() -> None:
    """A day already consumed by attendance is reported, never silently moved."""
    from modules.attendance.models import AttendanceRecord
    from modules.employee.models import Employee
    from modules.organization.models import Department

    org = _org("acme")
    department = Department.all_objects.create(org_id=org.id, name="Ops")
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org, year=2026, dry_run=False)

    row = Holiday.all_objects.get(org_id=org.id, date=datetime.date(2026, 8, 25))
    employee = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@b.com",
        hire_date=datetime.date(2020, 1, 1),
        employment_type="fulltime",
        department=department,
    )
    AttendanceRecord.all_objects.create(
        org_id=org.id,
        employee=employee,
        work_date=datetime.date(2026, 8, 25),
        is_holiday_work=True,
        status="present",
        source="web",
    )

    # Upstream now claims the holiday moved.
    ref = CountryHoliday.objects.get(
        source_key=row.source_key, source=CountryHoliday.SOURCE_PROVIDER
    )
    ref.date = datetime.date(2026, 8, 27)
    ref.save()

    stats = reconcile_org_holidays(org=org, year=2026, dry_run=False)
    row.refresh_from_db()
    assert row.date == datetime.date(2026, 8, 25)
    assert stats.conflicted >= 1
    assert any("attendance" in c for c in stats.conflicts)


# --- tenancy ----------------------------------------------------------------


def test_company_a_overrides_are_invisible_to_company_b() -> None:
    org_a = _org("alpha")
    org_b = _org("bravo")
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org_a, year=2026, dry_run=False)
    reconcile_org_holidays(org=org_b, year=2026, dry_run=False)

    Holiday.all_objects.create(
        org_id=org_a.id,
        date=datetime.date(2026, 7, 1),
        name="Alpha Only Day",
        type="company",
        source=Holiday.SOURCE_COMPANY,
    )
    a_row = Holiday.all_objects.get(org_id=org_a.id, date=datetime.date(2026, 12, 25))
    a_row.excluded = True
    a_row.save()

    assert HolidayService.is_holiday(org_id=org_a.id, on_date=datetime.date(2026, 7, 1))
    assert not HolidayService.is_holiday(org_id=org_b.id, on_date=datetime.date(2026, 7, 1))

    # Alpha excluded Christmas; Bravo still observes it.
    assert not HolidayService.is_holiday(org_id=org_a.id, on_date=datetime.date(2026, 12, 25))
    assert HolidayService.is_holiday(org_id=org_b.id, on_date=datetime.date(2026, 12, 25))


# --- date-only storage ------------------------------------------------------


@pytest.mark.parametrize("tz", ["Asia/Kuala_Lumpur", "UTC", "America/Los_Angeles"])
def test_dates_do_not_shift_under_any_server_timezone(settings, tz: str) -> None:
    """Date-only storage must be inert to TIME_ZONE.

    Los Angeles is included deliberately: a negative UTC offset is where a
    datetime-backed column would shift backwards a day.
    """
    settings.TIME_ZONE = tz
    org = _org(f"tz-{tz.replace('/', '-').lower()}")
    import_country_holidays(country_code="MY", year=2026, dry_run=False)
    reconcile_org_holidays(org=org, year=2026, dry_run=False)

    row = Holiday.all_objects.get(org_id=org.id, date=datetime.date(2026, 8, 25))
    assert row.date == datetime.date(2026, 8, 25)
    assert isinstance(row.date, datetime.date)
    assert not isinstance(row.date, datetime.datetime)
    assert row.date.isoformat() == "2026-08-25"
