"""Tests for the user-role assignment service + endpoint (Feature 1)."""

import pytest
from django.core.management import call_command

from modules.identity.models import Role, User, UserRole
from modules.identity.services.permissions import (
    SelfDemoteError,
    UnknownRoleError,
    assign_roles_to_user,
)
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


@pytest.fixture(autouse=True)
def seed_roles(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _user(org, email):
    return User.objects.create_user(
        email=email, password="x", org_id=org.id
    )  # pragma: allowlist secret


def _grant(user, code):
    role = Role.objects.get(org_id=user.org_id, code=code)
    UserRole.objects.create(user=user, role=role)


@pytest.mark.django_db
def test_assign_roles_replaces_set(org):
    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    _grant(target, "employee")

    assign_roles_to_user(actor=admin, target=target, role_codes=["manager", "team_lead"])

    target_codes = set(UserRole.objects.filter(user=target).values_list("role__code", flat=True))
    assert target_codes == {"manager", "team_lead"}  # employee dropped


@pytest.mark.django_db
def test_assign_roles_unknown_code_raises(org):
    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    with pytest.raises(UnknownRoleError):
        assign_roles_to_user(actor=admin, target=target, role_codes=["manager", "ceo"])


@pytest.mark.django_db
def test_assign_roles_self_demote_blocked(org):
    """Removing your own org_admin role from yourself is refused."""
    admin = _user(org, "admin@a.com")
    other = _user(org, "other@a.com")
    _grant(admin, "org_admin")
    _grant(other, "org_admin")  # ensure not the last admin
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])


@pytest.mark.django_db
def test_assign_roles_last_admin_blocked(org):
    """Removing org_admin from the last admin in the org is refused."""
    admin = _user(org, "admin@a.com")
    _grant(admin, "org_admin")
    # only one admin; admin trying to demote themselves blocked.
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])

    # Different scenario: 2 admins, demote one (the OTHER) — should succeed.
    admin2 = _user(org, "admin2@a.com")
    _grant(admin2, "org_admin")
    assign_roles_to_user(actor=admin, target=admin2, role_codes=["manager"])
    assert UserRole.objects.filter(user=admin2, role__code="org_admin").count() == 0

    # Now admin is the last admin again; admin trying to demote themselves still blocked.
    with pytest.raises(SelfDemoteError):
        assign_roles_to_user(actor=admin, target=admin, role_codes=["manager"])


@pytest.mark.django_db
def test_assign_roles_idempotent(org):
    """Same set in → no-op, no audit rows."""
    from common.audit.models import AuditLog

    admin = _user(org, "admin@a.com")
    target = _user(org, "t@a.com")
    _grant(target, "manager")

    initial_audit = AuditLog.objects.count()
    assign_roles_to_user(actor=admin, target=target, role_codes=["manager"])
    assert AuditLog.objects.count() == initial_audit  # no diff, no audit
