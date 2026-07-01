"""Tests for the per-user effective-access endpoint (permission -> source roles)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _perm(code):
    p, _ = Permission.objects.get_or_create(code=code, defaults={"description": code})
    return p


def _role(org, code, *perm_codes):
    r = Role.objects.create(org_id=org.id, code=code, name=code.title())
    for c in perm_codes:
        RolePermission.objects.create(role=r, permission=_perm(c))
    return r


@pytest.fixture
def setup(db):
    org = Organization.objects.create(
        name="X", slug="x-eff", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    admin_role = _role(org, "org_admin", "role:read")
    admin = User.objects.create_user(email="admin@x.com", password="x", org_id=org.id)
    UserRole.objects.create(user=admin, role=admin_role)
    c = APIClient()
    c.force_authenticate(admin)
    return {"org": org, "client": c}


def test_effective_access_unions_roles_and_lists_sources(setup):
    org = setup["org"]
    # two roles that BOTH grant employee:read:org, plus one unique perm each
    r1 = _role(org, "manager", "employee:read:org", "leave:request:approve:team")
    r2 = _role(org, "hr", "employee:read:org", "employee:write:org")
    target = User.objects.create_user(email="t@x.com", password="x", org_id=org.id)
    UserRole.objects.create(user=target, role=r1)
    UserRole.objects.create(user=target, role=r2)

    r = setup["client"].get(f"/api/v1/users/{target.id}/effective-access/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert {x["code"] for x in body["roles"]} == {"manager", "hr"}

    # flatten permissions across modules
    perms = {p["code"]: p for m in body["modules"] for p in m["permissions"]}
    # only the union of granted perms appears
    assert set(perms) == {
        "employee:read:org",
        "leave:request:approve:team",
        "employee:write:org",
    }
    # the shared permission lists BOTH source roles
    assert sorted(perms["employee:read:org"]["sources"]) == ["hr", "manager"]
    # a unique permission lists only its role
    assert perms["employee:write:org"]["sources"] == ["hr"]


def test_effective_access_requires_role_read(setup):
    org = setup["org"]
    plain = User.objects.create_user(email="plain@x.com", password="x", org_id=org.id)
    c = APIClient()
    c.force_authenticate(plain)
    assert c.get(f"/api/v1/users/{plain.id}/effective-access/").status_code == 403
