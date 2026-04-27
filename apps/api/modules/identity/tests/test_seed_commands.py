"""Tests for seed_permission_catalogue and seed_default_roles."""

import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m1b_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check a few critical ones
    assert "auth:mfa:manage:self" in codes
    assert "user:invite" in codes
    assert "department:write" in codes
    assert "audit:payroll-ledger:verify:org" in codes
    assert len(codes) >= 18


@pytest.mark.django_db
def test_seed_permission_catalogue_idempotent() -> None:
    call_command("seed_permission_catalogue")
    n = Permission.objects.count()
    call_command("seed_permission_catalogue")
    assert Permission.objects.count() == n


@pytest.mark.django_db
def test_seed_default_roles_creates_seven_roles_for_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    codes = set(Role.objects.filter(org_id=org_id).values_list("code", flat=True))
    assert codes == {
        "org_admin",
        "hr_manager",
        "finance",
        "manager",
        "team_lead",
        "employee",
        "auditor",
    }


@pytest.mark.django_db
def test_seed_default_roles_links_permissions() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    org_admin = Role.objects.get(org_id=org_id, code="org_admin")
    perm_codes = set(org_admin.permissions.values_list("code", flat=True))
    assert "user:invite" in perm_codes
    assert "audit:payroll-ledger:verify:org" in perm_codes


@pytest.mark.django_db
def test_seed_default_roles_idempotent_per_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    n_roles = Role.objects.filter(org_id=org_id).count()
    n_links = RolePermission.objects.filter(role__org_id=org_id).count()

    call_command("seed_default_roles", "--org-id", str(org_id))
    assert Role.objects.filter(org_id=org_id).count() == n_roles
    assert RolePermission.objects.filter(role__org_id=org_id).count() == n_links


@pytest.mark.django_db
def test_seed_default_roles_requires_existing_permissions() -> None:
    """If permission catalogue hasn't been seeded yet, seeding roles should error clearly."""
    from django.core.management.base import CommandError

    org_id = uuid.uuid4()
    with pytest.raises(CommandError):
        call_command("seed_default_roles", "--org-id", str(org_id))
