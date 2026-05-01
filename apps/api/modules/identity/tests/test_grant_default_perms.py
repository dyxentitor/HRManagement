"""Tests for the grant_default_perms management command.

The command is the additive counterpart to seed_default_roles. It backfills
permissions that have been added to default_roles.yaml *after* a role's
initial seed (which is the v1.4.0 bug class — new perms in the YAML never
reach existing role rows because seed_default_roles is non-destructive).
"""

from __future__ import annotations

import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org() -> Organization:
    org = Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", org_id=str(org.id))
    return org


def test_grant_default_perms_adds_missing_team_perms(org):
    """Simulate the v1.4.0 bug: existing org_admin row missing team:read+write."""
    role = Role.objects.get(org_id=org.id, code="org_admin")
    team_perms = Permission.objects.filter(code__in=["team:read", "team:write"])
    # Strip them so we can assert the backfill restores them.
    RolePermission.objects.filter(
        role=role,
        permission__in=team_perms,
    ).delete()
    assert not RolePermission.objects.filter(
        role=role,
        permission__code="team:read",
    ).exists()

    call_command("grant_default_perms", org_id=str(org.id))

    assert RolePermission.objects.filter(
        role=role,
        permission__code="team:read",
    ).exists()
    assert RolePermission.objects.filter(
        role=role,
        permission__code="team:write",
    ).exists()


def test_grant_default_perms_is_idempotent(org):
    role = Role.objects.get(org_id=org.id, code="org_admin")
    n_before = RolePermission.objects.filter(role=role).count()

    call_command("grant_default_perms", org_id=str(org.id))
    n_after_1 = RolePermission.objects.filter(role=role).count()

    call_command("grant_default_perms", org_id=str(org.id))
    n_after_2 = RolePermission.objects.filter(role=role).count()

    assert n_after_1 == n_after_2 == n_before


def test_grant_default_perms_never_removes_admin_customizations(org):
    """If an admin removed a default perm, grant_default_perms should re-add it
    (the contract is "ensure default perms exist"). But it must not remove
    any *additional* perms the admin granted beyond defaults."""
    role = Role.objects.get(org_id=org.id, code="manager")
    extra = Permission.objects.get(code="audit:read:org")  # not in manager defaults
    RolePermission.objects.create(role=role, permission=extra)

    call_command("grant_default_perms", org_id=str(org.id))

    assert RolePermission.objects.filter(
        role=role,
        permission=extra,
    ).exists()


def test_grant_default_perms_processes_all_orgs_when_no_filter(org):
    other_org = Organization.objects.create(
        slug="other",
        name="Other",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    call_command("seed_default_roles", org_id=str(other_org.id))
    other_admin = Role.objects.get(org_id=other_org.id, code="org_admin")
    RolePermission.objects.filter(
        role=other_admin,
        permission__code="team:read",
    ).delete()

    call_command("grant_default_perms")  # no --org-id

    assert RolePermission.objects.filter(
        role=other_admin,
        permission__code="team:read",
    ).exists()


def test_grant_default_perms_unknown_org_does_nothing(org):
    fake = uuid.uuid4()
    # Should not raise; just no work to do.
    call_command("grant_default_perms", org_id=str(fake))
