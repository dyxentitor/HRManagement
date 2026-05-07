"""Tests for the seed_country_reference_data management command."""

import pytest
from django.core.management import call_command

from modules.organization.models import Country, CountryHoliday, CountryLeaveTypeDefault


@pytest.mark.django_db
def test_seed_loads_my_country() -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    assert Country.objects.filter(code="MY").exists()
    assert CountryLeaveTypeDefault.objects.filter(country_code="MY", code="ANNUAL").exists()
    assert CountryHoliday.objects.filter(country_code="MY", name="Labour Day").exists()


@pytest.mark.django_db
def test_seed_is_idempotent() -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    initial_holidays = CountryHoliday.objects.count()
    call_command("seed_country_reference_data", "--country", "MY")
    assert CountryHoliday.objects.count() == initial_holidays


@pytest.mark.django_db
def test_seed_country_my_has_tenure_brackets() -> None:
    """v1.8.0: MY country fixture seeds §60E annual + §60F medical tenure tiers."""
    call_command("seed_country_reference_data", "--country", "MY")

    annual = CountryLeaveTypeDefault.objects.get(country_code="MY", code="ANNUAL")
    assert annual.tenure_brackets == [
        {"min_years": 0, "days": 8},
        {"min_years": 2, "days": 12},
        {"min_years": 5, "days": 16},
    ]

    medical = CountryLeaveTypeDefault.objects.get(country_code="MY", code="MEDICAL")
    assert medical.tenure_brackets == [
        {"min_years": 0, "days": 14},
        {"min_years": 2, "days": 18},
        {"min_years": 5, "days": 22},
    ]

    # New v1.8.0 leave type — separate from outpatient sick post-2022 §60F amendment
    hosp = CountryLeaveTypeDefault.objects.get(country_code="MY", code="HOSPITALIZATION")
    assert hosp.default_days == 60
    assert hosp.tenure_brackets == []  # flat 60 across tenures
