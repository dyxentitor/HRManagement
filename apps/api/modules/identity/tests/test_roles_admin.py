"""Tests for the role-permission editor service + endpoint (Feature 2)."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.identity.services.permissions import (
    LastWritePermissionHolderError,
    OrgAdminProtectionError,
    UnknownPermissionError,
    set_role_permissions,
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
def seed(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _admin_user(org):
    u = User.objects.create_user(
        email="admin@a.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.get(org_id=org.id, code="org_admin")
    UserRole.objects.create(user=u, role=role)
    return u


@pytest.mark.django_db
def test_set_permissions_happy_path(org):
    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    new_codes = ["leave:request:create:self", "approvals:inbox:read"]

    set_role_permissions(actor=actor, role_code="manager", permission_codes=new_codes)

    after = set(
        RolePermission.objects.filter(role=manager).values_list("permission__code", flat=True),
    )
    assert after == set(new_codes)


@pytest.mark.django_db
def test_unknown_permission_raises(org):
    actor = _admin_user(org)
    with pytest.raises(UnknownPermissionError):
        set_role_permissions(
            actor=actor,
            role_code="manager",
            permission_codes=["leave:request:create:self", "ceo:approve:everything"],
        )


@pytest.mark.django_db
def test_org_admin_keeps_critical_perms(org):
    actor = _admin_user(org)
    # Try to give org_admin a tiny set that drops role:write
    with pytest.raises(OrgAdminProtectionError):
        set_role_permissions(
            actor=actor,
            role_code="org_admin",
            permission_codes=["employee:read:self"],
        )


@pytest.mark.django_db
def test_last_write_holder_blocked(org):
    """If only `manager` holds payroll:run:create and we strip it, refuse."""
    actor = _admin_user(org)
    # Move payroll:run:create to a state where only `manager` holds it
    payroll_perm = Permission.objects.get(code="payroll:run:create")
    RolePermission.objects.filter(permission=payroll_perm).delete()
    manager = Role.objects.get(org_id=org.id, code="manager")
    RolePermission.objects.create(role=manager, permission=payroll_perm)

    # Try to PATCH manager to a set without payroll:run:create — should refuse
    with pytest.raises(LastWritePermissionHolderError) as exc:
        set_role_permissions(
            actor=actor,
            role_code="manager",
            permission_codes=["leave:request:create:self"],
        )
    assert "payroll:run:create" in str(exc.value)


@pytest.mark.django_db
def test_idempotent_no_audit(org):
    from common.audit.models import AuditLog

    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    current = list(
        RolePermission.objects.filter(role=manager).values_list("permission__code", flat=True),
    )
    initial_audit = AuditLog.objects.count()
    set_role_permissions(actor=actor, role_code="manager", permission_codes=current)
    assert AuditLog.objects.count() == initial_audit
