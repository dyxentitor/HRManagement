"""Tests for `seed_leave_types_from_country`."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from modules.leave.models import LeaveType
from modules.organization.models import Organization


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
def test_seed_loads_my_leave_types(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    codes = set(LeaveType.all_objects.filter(org_id=org_my.id).values_list("code", flat=True))
    # 7 statutory MY types from M1a fixture
    assert codes == {
        "ANNUAL",
        "MEDICAL",
        "MATERNITY",
        "PATERNITY",
        "COMPASSIONATE",
        "UNPAID",
        "REPLACEMENT",
    }


@pytest.mark.django_db
def test_seed_idempotent(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    n1 = LeaveType.all_objects.filter(org_id=org_my.id).count()
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    n2 = LeaveType.all_objects.filter(org_id=org_my.id).count()
    assert n1 == n2


@pytest.mark.django_db
def test_maternity_is_female_only(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    mat = LeaveType.all_objects.get(org_id=org_my.id, code="MATERNITY")
    assert mat.gender_restriction == "female"


@pytest.mark.django_db
def test_seed_errors_when_no_country_data(org_my: Organization) -> None:
    """Skip the country reference seed; should error clearly."""
    with pytest.raises(CommandError):
        call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
