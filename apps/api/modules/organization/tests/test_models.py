"""Tests for Organization, Country, CountryHoliday, CountryLeaveTypeDefault."""

import datetime
import uuid

import pytest

from modules.organization.models import (
    Country,
    CountryHoliday,
    CountryLeaveTypeDefault,
    Organization,
)


@pytest.mark.django_db
def test_country_create_with_iso_code() -> None:
    c = Country.objects.create(
        code="MY",
        name="Malaysia",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
    )
    assert c.code == "MY"


@pytest.mark.django_db
def test_country_holiday_unique_per_country_date() -> None:
    Country.objects.create(
        code="MY", name="Malaysia", default_currency="MYR", default_timezone="Asia/Kuala_Lumpur"
    )
    CountryHoliday.objects.create(
        country_code="MY", date=datetime.date(2026, 5, 1), name="Labour Day", type="federal"
    )
    with pytest.raises(Exception):  # IntegrityError from unique-together
        CountryHoliday.objects.create(
            country_code="MY", date=datetime.date(2026, 5, 1), name="Labour Day", type="federal"
        )


@pytest.mark.django_db
def test_country_leave_type_default_seed_shape() -> None:
    Country.objects.create(
        code="MY", name="Malaysia", default_currency="MYR", default_timezone="Asia/Kuala_Lumpur"
    )
    row = CountryLeaveTypeDefault.objects.create(
        country_code="MY",
        code="ANNUAL",
        name="Annual Leave",
        default_days=14,
        statutory=True,
        accrual_type="annual",
    )
    assert row.code == "ANNUAL"


@pytest.mark.django_db
def test_organization_required_fields() -> None:
    org = Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    assert isinstance(org.id, uuid.UUID)
    assert org.status == "active"
    assert org.settings == {}


@pytest.mark.django_db
def test_organization_slug_unique() -> None:
    Organization.objects.create(
        name="A",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    with pytest.raises(Exception):
        Organization.objects.create(
            name="B",
            slug="acme",
            country_code="MY",
            default_currency="MYR",
            default_timezone="Asia/Kuala_Lumpur",
            default_locale="en-MY",
        )
