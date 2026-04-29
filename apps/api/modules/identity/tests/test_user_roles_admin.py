"""Tests for the user-role assignment service + endpoint (Feature 1)."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.identity.models import Role, User, UserRole
from modules.identity.services.permissions import (
    LastAdminError,
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


def _login(client, email):
    resp = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_assign_roles_last_admin_error_when_other_demotes_last_admin(org):
    """Setup: only `sole_admin` has org_admin. Another actor with role:write
    tries to strip sole_admin's org_admin → LastAdminError."""
    sole_admin = _user(org, "sole@a.com")
    _grant(sole_admin, "org_admin")
    actor = _user(org, "actor@a.com")
    # Give actor enough perms to call the service. Service-level test —
    # we don't go through the endpoint here.
    _grant(actor, "manager")  # any role that's not org_admin

    with pytest.raises(LastAdminError):
        assign_roles_to_user(
            actor=actor,
            target=sole_admin,
            role_codes=["manager"],  # drops org_admin
        )


@pytest.mark.django_db
def test_endpoint_assign_roles_writes_two_audit_rows(org):
    """One row for the granted role, one for the revoked role."""
    from common.audit.models import AuditLog

    admin = _user(org, "admin@a.com")
    _grant(admin, "org_admin")
    target = _user(org, "t@a.com")
    _grant(target, "employee")

    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    granted_before = AuditLog.objects.filter(action="user.role_granted").count()
    revoked_before = AuditLog.objects.filter(action="user.role_revoked").count()
    resp = client.patch(
        f"/api/v1/users/{target.id}/roles/",
        {"role_codes": ["manager"]},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert AuditLog.objects.filter(action="user.role_granted").count() == granted_before + 1
    assert AuditLog.objects.filter(action="user.role_revoked").count() == revoked_before + 1


@pytest.mark.django_db
def test_endpoint_target_not_found_returns_404(org):
    admin = _user(org, "admin@a.com")
    _grant(admin, "org_admin")
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.patch(
        "/api/v1/users/00000000-0000-0000-0000-000000000000/roles/",
        {"role_codes": ["manager"]},
        format="json",
    )
    assert resp.status_code == 404
