"""seed_leave_types_from_country writes a default org-wide LeavePolicy + statute fields."""

import pytest
from django.core.management import call_command

from modules.leave.models import LeavePolicy, LeaveType
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_seed_creates_leave_types_with_v18_fields(org) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org.id))

    paternity = LeaveType.all_objects.get(org_id=org.id, code="PATERNITY")
    assert paternity.requires_service_months == 12
    assert paternity.notice_days_required == 30
    assert paternity.max_per_lifetime_events == 5

    maternity = LeaveType.all_objects.get(org_id=org.id, code="MATERNITY")
    assert maternity.max_per_lifetime_events == 5

    annual = LeaveType.all_objects.get(org_id=org.id, code="ANNUAL")
    # Default carry-forward expiry hint for ANNUAL: 12 months (statute max).
    assert annual.carry_forward_expiry_months == 12


@pytest.mark.django_db
def test_seed_creates_default_policy_with_tenure_brackets(org) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org.id))

    annual = LeaveType.all_objects.get(org_id=org.id, code="ANNUAL")
    pol = LeavePolicy.all_objects.get(
        org_id=org.id,
        leave_type=annual,
        applies_to_role_id__isnull=True,
        applies_to_department_id__isnull=True,
    )
    assert pol.tenure_brackets == [
        {"min_years": 0, "days": 8},
        {"min_years": 2, "days": 12},
        {"min_years": 5, "days": 16},
    ]


@pytest.mark.django_db
def test_seed_idempotent_no_dupe_policies(org) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org.id))
    call_command("seed_leave_types_from_country", "--org-id", str(org.id))

    annual = LeaveType.all_objects.get(org_id=org.id, code="ANNUAL")
    n_policies = LeavePolicy.all_objects.filter(
        org_id=org.id,
        leave_type=annual,
        applies_to_role_id__isnull=True,
        applies_to_department_id__isnull=True,
    ).count()
    assert n_policies == 1
