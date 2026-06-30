"""Tests for the role membership API (list / bulk add / remove)."""

from __future__ import annotations

import datetime as dt

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


def _perm(code):
    p, _ = Permission.objects.get_or_create(code=code, defaults={"description": code})
    return p


def _role(org, code, *perm_codes):
    r = Role.objects.create(org_id=org.id, code=code, name=code.title())
    for c in perm_codes:
        RolePermission.objects.create(role=r, permission=_perm(c))
    return r


def _user(org, email, role=None):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)
    if role:
        UserRole.objects.create(user=u, role=role)
    return u


@pytest.fixture
def setup(db):
    org = Organization.objects.create(
        name="X",
        slug="x-mem",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    admin_role = _role(org, "org_admin", "role:read", "role:write")
    admin = _user(org, "admin@x.com", admin_role)
    _user(org, "admin2@x.com", admin_role)  # second admin
    target_role = _role(org, "viewer", "leave:request:read:self")
    # two plain users with employee records, in a base "employee" role
    base = _role(org, "employee", "leave:request:read:self")
    u1 = _user(org, "u1@x.com", base)
    u2 = _user(org, "u2@x.com", base)
    for u, code in ((u1, "E1"), (u2, "E2")):
        Employee.all_objects.create(
            org_id=org.id,
            user=u,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code.lower()}@x.com",
            department=dept,
            employment_type="fulltime",
            hire_date=dt.date(2024, 1, 1),
        )
    c = APIClient()
    c.force_authenticate(admin)
    return {"org": org, "client": c, "viewer": target_role, "u1": u1, "u2": u2}


def test_bulk_add_emits_one_audit_row_per_user(setup):
    before = AuditLog.objects.filter(action="user.role_granted").count()
    r = setup["client"].post(
        "/api/v1/roles/viewer/members/",
        {"user_ids": [str(setup["u1"].id), str(setup["u2"].id)]},
        format="json",
    )
    assert r.status_code == 200, r.content
    assert UserRole.objects.filter(role=setup["viewer"]).count() == 2
    after = AuditLog.objects.filter(action="user.role_granted").count()
    assert after - before == 2  # one row per user, not one per batch


def test_list_members(setup):
    UserRole.objects.create(user=setup["u1"], role=setup["viewer"])
    r = setup["client"].get("/api/v1/roles/viewer/members/")
    assert r.status_code == 200
    names = {m["name"] for m in r.json()}
    assert "E1 x" in names


def test_remove_member_keeps_other_roles(setup):
    UserRole.objects.create(user=setup["u1"], role=setup["viewer"])  # now u1 has employee + viewer
    r = setup["client"].delete(f"/api/v1/roles/viewer/members/{setup['u1'].id}/")
    assert r.status_code == 200, r.content
    codes = set(UserRole.objects.filter(user=setup["u1"]).values_list("role__code", flat=True))
    assert codes == {"employee"}  # viewer removed, employee kept


def test_remove_only_role_allowed(setup):
    # Per the v1.46.0 change: removing a person's last role is allowed (the UI warns first).
    solo = _user(setup["org"], "solo@x.com", setup["viewer"])  # viewer is their ONLY role
    r = setup["client"].delete(f"/api/v1/roles/viewer/members/{solo.id}/")
    assert r.status_code == 200, r.content
    assert UserRole.objects.filter(user=solo).count() == 0  # removed; now has no roles


def test_members_payload_includes_other_roles(setup):
    UserRole.objects.create(user=setup["u1"], role=setup["viewer"])  # u1: employee + viewer
    r = setup["client"].get("/api/v1/roles/viewer/members/")
    assert r.status_code == 200
    member = next(m for m in r.json() if m["user_id"] == str(setup["u1"].id))
    role_codes = {x["code"] for x in member["roles"]}
    assert {"employee", "viewer"} <= role_codes
