"""Tests for `seed_holidays_from_country`."""

import pytest
from django.core.management import call_command

from modules.organization.models import Organization
from modules.schedule.models import Holiday


@pytest.fixture
def org_my() -> Organization:
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_seed_loads_my_2026_holidays(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    assert Holiday.all_objects.filter(org_id=org_my.id).count() >= 13  # MY 2026 federal


@pytest.mark.django_db
def test_seed_idempotent(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    n1 = Holiday.all_objects.filter(org_id=org_my.id).count()
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    n2 = Holiday.all_objects.filter(org_id=org_my.id).count()
    assert n1 == n2
