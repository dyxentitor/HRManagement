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
