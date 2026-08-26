"""Command-surface tests for `sync_country_holidays` / `load_official_holidays`."""

from __future__ import annotations

import datetime
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from modules.organization.models import CountryHoliday, Organization
from modules.schedule.models import Holiday

pytestmark = pytest.mark.django_db


def _run(*args: str) -> str:
    out = StringIO()
    call_command(*args, stdout=out, stderr=out)
    return out.getvalue()


@pytest.fixture
def org_my() -> Organization:
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_subdivision_code="MY-10",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def test_dry_run_is_the_default_and_writes_nothing() -> None:
    out = _run("sync_country_holidays", "--country", "SG", "--year", "2026")
    assert "DRY-RUN" in out
    assert "Re-run with --apply" in out
    assert CountryHoliday.objects.filter(country_code="SG").count() == 0


def test_apply_persists_and_reports_all_six_counters() -> None:
    out = _run("sync_country_holidays", "--country", "SG", "--year", "2026", "--apply")
    assert "APPLIED" in out
    for counter in ("added", "updated", "unchanged", "withdrawn", "skipped", "conflicted"):
        assert f"{counter}=" in out
    assert CountryHoliday.objects.filter(country_code="SG").exists()


def test_running_twice_produces_the_same_result() -> None:
    _run("sync_country_holidays", "--country", "SG", "--year", "2026", "--apply")
    snapshot = sorted(
        CountryHoliday.objects.filter(country_code="SG").values_list("source_key", "date")
    )
    out = _run("sync_country_holidays", "--country", "SG", "--year", "2026", "--apply")
    assert "added=0" in out
    assert "updated=0" in out
    assert (
        sorted(CountryHoliday.objects.filter(country_code="SG").values_list("source_key", "date"))
        == snapshot
    )


def test_sync_orgs_reconciles_the_org_calendar(org_my: Organization) -> None:
    out = _run(
        "sync_country_holidays",
        "--country",
        "MY",
        "--subdivision",
        "MY-10",
        "--year",
        "2026",
        "--apply",
        "--sync-orgs",
    )
    assert f"org {org_my.slug}" in out
    rows = Holiday.all_objects.filter(org_id=org_my.id, deleted_at__isnull=True)
    assert rows.filter(date=datetime.date(2026, 8, 25)).exists()
    assert rows.filter(date=datetime.date(2026, 12, 11)).exists()  # MY-10 only


def test_unknown_provider_is_a_clean_command_error() -> None:
    with pytest.raises(CommandError, match="Unknown holiday provider"):
        _run("sync_country_holidays", "--country", "MY", "--year", "2026", "--provider", "nope")


def test_bad_jurisdiction_is_a_clean_command_error() -> None:
    with pytest.raises(CommandError):
        _run("sync_country_holidays", "--country", "MYS", "--year", "2026")
    with pytest.raises(CommandError):
        _run("sync_country_holidays", "--country", "MY", "--subdivision", "MY-99", "--year", "2026")


def test_official_loader_runs_and_defaults_to_dry_run() -> None:
    out = _run("load_official_holidays", "--country", "MY")
    assert "DRY-RUN" in out


def test_official_loader_rejects_an_uncited_entry(tmp_path, monkeypatch) -> None:
    """Every official override must cite a government source."""
    import modules.organization.management.commands.load_official_holidays as mod

    fixture = tmp_path / "official_holidays_zz.yaml"
    fixture.write_text(
        "holidays:\n"
        "  - country_code: ZZ\n"
        "    date: 2026-08-25\n"
        "    name: Uncited Day\n"
        "    type: federal\n"
    )
    monkeypatch.setattr(mod, "FIXTURE_DIR", tmp_path)
    with pytest.raises(CommandError, match="reference"):
        _run("load_official_holidays", "--country", "ZZ")
