"""Tests for the role-permission editor service + endpoint (Feature 2)."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

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


@pytest.mark.django_db
def test_reset_to_defaults(org):
    """Reset re-applies the fixture's permissions for that role."""
    actor = _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    # Strip manager to nothing
    RolePermission.objects.filter(role=manager).delete()
    assert RolePermission.objects.filter(role=manager).count() == 0

    from modules.identity.services.permissions import reset_role_to_defaults

    reset_role_to_defaults(actor=actor, role_code="manager")

    after = RolePermission.objects.filter(role=manager).count()
    assert after > 0  # fixture restored some perms

    # Audit row written
    from common.audit.models import AuditLog

    assert AuditLog.objects.filter(action="role.reset_to_defaults").exists()


def _login(client, email):
    resp = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_endpoint_list_roles(org):
    _admin_user(org)
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/roles/")
    assert resp.status_code == 200, resp.content
    codes = {r["code"] for r in resp.json()}
    assert {"org_admin", "manager", "employee"} <= codes


@pytest.mark.django_db
def test_endpoint_patch_permissions_writes_audit(org):
    from common.audit.models import AuditLog

    _admin_user(org)
    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    initial_audit = AuditLog.objects.filter(action="role.permissions_changed").count()
    resp = client.patch(
        "/api/v1/roles/manager/permissions/",
        {"permission_codes": ["leave:request:create:self"]},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    after_audit = AuditLog.objects.filter(action="role.permissions_changed").count()
    assert after_audit == initial_audit + 1


@pytest.mark.django_db
def test_endpoint_employee_cannot_patch(org):
    """Employee role lacks role:write — must 403."""
    emp = User.objects.create_user(
        email="emp@a.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    UserRole.objects.create(
        user=emp,
        role=Role.objects.get(org_id=org.id, code="employee"),
    )
    client = APIClient()
    token = _login(client, "emp@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.patch(
        "/api/v1/roles/manager/permissions/",
        {"permission_codes": []},
        format="json",
    )
    assert resp.status_code == 403, resp.content


@pytest.mark.django_db
def test_endpoint_reset_to_defaults(org):
    """POST /roles/{code}/reset-to-defaults/ restores fixture perms."""
    _admin_user(org)
    manager = Role.objects.get(org_id=org.id, code="manager")
    RolePermission.objects.filter(role=manager).delete()
    assert RolePermission.objects.filter(role=manager).count() == 0

    client = APIClient()
    token = _login(client, "admin@a.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.post("/api/v1/roles/manager/reset-to-defaults/", format="json")
    assert resp.status_code == 200, resp.content
    assert RolePermission.objects.filter(role=manager).count() > 0
