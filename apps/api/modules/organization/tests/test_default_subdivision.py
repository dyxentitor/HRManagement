"""Validation and tenancy tests for `Organization.default_subdivision_code`."""

from __future__ import annotations

import datetime

import pytest
from django.core.exceptions import ValidationError

from modules.organization.models import Organization
from modules.organization.validators import validate_default_subdivision
from modules.schedule.services.holiday import HolidayService, reconcile_org_holidays

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


# --- validation -------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"), [("MY-10", "MY-10"), ("10", "MY-10"), ("my-10", "MY-10")]
)
def test_accepts_and_normalizes_a_valid_subdivision(raw: str, expected: str) -> None:
    assert validate_default_subdivision(country_code="MY", subdivision_code=raw) == expected


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_blank_is_valid_and_means_national_only(blank) -> None:
    """The safe fallback — not an error."""
    assert validate_default_subdivision(country_code="MY", subdivision_code=blank) == ""


def test_rejects_a_subdivision_from_another_country() -> None:
    with pytest.raises(ValidationError):
        validate_default_subdivision(country_code="MY", subdivision_code="SG-01")


def test_rejects_a_wellformed_but_nonexistent_subdivision() -> None:
    """`MY-99` parses as ISO 3166-2 but no such Malaysian subdivision exists."""
    with pytest.raises(ValidationError):
        validate_default_subdivision(country_code="MY", subdivision_code="MY-99")


@pytest.mark.parametrize("bad", ["ZZZZ", "MY-", "-10", "MY-1234"])
def test_rejects_malformed_codes(bad: str) -> None:
    with pytest.raises(ValidationError):
        validate_default_subdivision(country_code="MY", subdivision_code=bad)


def test_singapore_has_no_subdivisions_so_any_code_is_rejected() -> None:
    with pytest.raises(ValidationError):
        validate_default_subdivision(country_code="SG", subdivision_code="SG-01")
    assert validate_default_subdivision(country_code="SG", subdivision_code="") == ""


# --- serializer surface -----------------------------------------------------


def test_serializer_rejects_cross_country_subdivision() -> None:
    from modules.organization.serializers import OrgSettingsSerializer

    org = _org("acme")
    ser = OrgSettingsSerializer(org, data={"default_subdivision_code": "SG-01"}, partial=True)
    assert not ser.is_valid()
    assert "default_subdivision_code" in ser.errors


def test_serializer_normalizes_a_bare_subdivision_part() -> None:
    from modules.organization.serializers import OrgSettingsSerializer

    org = _org("acme")
    ser = OrgSettingsSerializer(org, data={"default_subdivision_code": "14"}, partial=True)
    assert ser.is_valid(), ser.errors
    assert ser.save().default_subdivision_code == "MY-14"


# --- tenancy + fallback -----------------------------------------------------


def test_subdivision_is_per_org_and_does_not_leak(django_assert_num_queries=None) -> None:
    kl = _org("kl-co", subdivision="MY-14")
    selangor = _org("sel-co", subdivision="MY-10")
    national = _org("nat-co")

    kl.refresh_from_db()
    selangor.refresh_from_db()
    national.refresh_from_db()

    assert kl.default_subdivision_code == "MY-14"
    assert selangor.default_subdivision_code == "MY-10"
    assert national.default_subdivision_code == ""


def test_two_orgs_in_different_states_get_different_calendars() -> None:
    from django.core.management import call_command

    call_command("load_official_holidays", "--country", "MY", "--apply")
    kl = _org("kl-co", subdivision="MY-14")
    selangor = _org("sel-co", subdivision="MY-10")

    reconcile_org_holidays(org=kl, year=2026, dry_run=False)
    reconcile_org_holidays(org=selangor, year=2026, dry_run=False)

    ft_day = datetime.date(2026, 2, 1)  # Federal Territory Day — KL yes, Selangor no
    assert HolidayService.is_holiday(org_id=kl.id, on_date=ft_day)
    assert not HolidayService.is_holiday(org_id=selangor.id, on_date=ft_day)

    # A nationwide day is shared by both.
    merdeka = datetime.date(2026, 8, 31)
    assert HolidayService.is_holiday(org_id=kl.id, on_date=merdeka)
    assert HolidayService.is_holiday(org_id=selangor.id, on_date=merdeka)


def test_blank_subdivision_falls_back_safely_to_national_holidays() -> None:
    from django.core.management import call_command

    call_command("load_official_holidays", "--country", "MY", "--apply")
    org = _org("nat-co")  # no subdivision selected
    stats = reconcile_org_holidays(org=org, year=2026, dry_run=False)

    # Still gets the nationwide list rather than an empty calendar.
    assert stats.added > 0
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 8, 31))
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 8, 25))
