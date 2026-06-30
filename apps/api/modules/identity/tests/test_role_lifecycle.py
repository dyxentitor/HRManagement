"""Tests for the custom-role lifecycle API + guardrails."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _perm(code):
    p, _ = Permission.objects.get_or_create(code=code, defaults={"description": code})
    return p


def _role(org, code, *perm_codes, is_system=False):
    r = Role.objects.create(org_id=org.id, code=code, name=code.title(), is_system=is_system)
    for c in perm_codes:
        RolePermission.objects.create(role=r, permission=_perm(c))
    return r


def _user_in(org, role, email):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)
    UserRole.objects.create(user=u, role=role)
    return u


@pytest.fixture
def admin(db):
    org = Organization.objects.create(
        name="X",
        slug="x-life",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    admin_role = _role(org, "org_admin", "role:read", "role:write")
    u = _user_in(org, admin_role, "admin@x.com")
    # a second admin so last-admin guard never blocks these tests
    _user_in(org, admin_role, "admin2@x.com")
    c = APIClient()
    c.force_authenticate(u)
    return {"org": org, "user": u, "client": c}


def test_create_custom_role_empty(admin):
    r = admin["client"].post("/api/v1/roles/", {"name": "Payroll Auditor"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["code"] == "payroll_auditor"
    assert body["is_system"] is False
    assert body["permission_codes"] == []  # least-privilege


def test_clone_role_snapshots_permissions(admin):
    src = _role(admin["org"], "src", "leave:request:read:self", "claim:read:self")
    r = admin["client"].post(f"/api/v1/roles/{src.code}/clone/", {"name": "Copy"}, format="json")
    assert r.status_code == 201, r.content
    assert set(r.json()["permission_codes"]) == {"leave:request:read:self", "claim:read:self"}


def test_rename_custom_role(admin):
    role = _role(admin["org"], "custom1")
    r = admin["client"].patch(f"/api/v1/roles/{role.code}/", {"name": "Renamed"}, format="json")
    assert r.status_code == 200, r.content
    assert r.json()["name"] == "Renamed"


def test_system_role_cannot_be_renamed_or_deleted(admin):
    sys = _role(admin["org"], "hr_manager", "role:read", is_system=True)
    assert (
        admin["client"]
        .patch(f"/api/v1/roles/{sys.code}/", {"name": "x"}, format="json")
        .status_code
        == 403
    )
    assert admin["client"].delete(f"/api/v1/roles/{sys.code}/").status_code == 403


def test_delete_custom_role_blocked_with_members(admin):
    role = _role(admin["org"], "withppl")
    _user_in(admin["org"], role, "member@x.com")
    r = admin["client"].delete(f"/api/v1/roles/{role.code}/")
    assert r.status_code == 409
    assert Role.objects.filter(code="withppl").exists()  # not deleted


def test_delete_empty_custom_role(admin):
    role = _role(admin["org"], "empty1")
    assert admin["client"].delete(f"/api/v1/roles/{role.code}/").status_code == 204
    assert not Role.objects.filter(code="empty1").exists()


def test_optimistic_lock_conflict(admin):
    role = _role(admin["org"], "lockme", "leave:request:read:self")
    detail = admin["client"].get(f"/api/v1/roles/{role.code}/").json()
    stale_base = detail["updated_at"]
    # someone else changes the role (bumps updated_at)
    role.name = "touched"
    role.save(update_fields=["name", "updated_at"])
    r = admin["client"].patch(
        f"/api/v1/roles/{role.code}/permissions/",
        {"permission_codes": [], "base_updated_at": stale_base},
        format="json",
    )
    assert r.status_code == 412, r.content


def test_self_lockout_blocks_removing_own_role_write(db):
    org = Organization.objects.create(
        name="L",
        slug="x-lock",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    ops = _role(org, "ops_admin", "role:read", "role:write")  # the actor's only role
    _role(org, "backup_admin", "role:write")  # another holder → last-write-holder guard passes
    actor = _user_in(org, ops, "ops@x.com")
    c = APIClient()
    c.force_authenticate(actor)
    # remove role:write from the actor's own role (keep role:read) → strips their own admin ability
    r = c.patch(
        "/api/v1/roles/ops_admin/permissions/",
        {"permission_codes": ["role:read"]},
        format="json",
    )
    assert r.status_code == 400, r.content
    assert "your own" in r.json()["detail"].lower()
