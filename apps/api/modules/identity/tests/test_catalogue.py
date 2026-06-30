"""Tests for the permission catalogue (grouping + metadata + endpoint)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from modules.identity import catalogue
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def test_scope_of():
    assert catalogue.scope_of("employee:read:org") == "org"
    assert catalogue.scope_of("leave:request:approve:team") == "team"
    assert catalogue.scope_of("attendance:clock:me") == "self"  # me normalizes to self
    assert catalogue.scope_of("role:write") is None
    assert catalogue.scope_of("user:invite") is None


def test_humanize():
    assert catalogue.humanize("employee:read:org") == "Employee Read"  # scope 'org' dropped
    assert catalogue.humanize("incentive:project:write") == "Incentive Project Write"


@pytest.mark.django_db
def test_build_catalogue_merges_split_domains():
    Permission.objects.get_or_create(code="payslip:read:self", defaults={"description": "x"})
    Permission.objects.get_or_create(code="payroll:exception:read", defaults={"description": "x"})
    mods = catalogue.build_catalogue()
    payroll = next(m for m in mods if m["key"] == "payroll")
    codes = {p["code"] for p in payroll["permissions"]}
    assert "payslip:read:self" in codes and "payroll:exception:read" in codes  # merged group


@pytest.mark.django_db
def test_build_catalogue_annotates_granted_for_role():
    org = Organization.objects.create(
        name="X",
        slug="x-cat",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    p1, _ = Permission.objects.get_or_create(
        code="employee:read:org", defaults={"description": "d"}
    )
    Permission.objects.get_or_create(code="employee:write:org", defaults={"description": "d"})
    role = Role.objects.create(org_id=org.id, code="r1", name="R1")
    RolePermission.objects.create(role=role, permission=p1)
    mods = catalogue.build_catalogue(role)
    people = next(m for m in mods if m["key"] == "people")
    by_code = {p["code"]: p for p in people["permissions"]}
    assert by_code["employee:read:org"]["granted"] is True
    assert by_code["employee:write:org"]["granted"] is False
    assert people["granted_count"] >= 1


@pytest.mark.django_db
def test_catalogue_endpoint_perm_gated():
    org = Organization.objects.create(
        name="Y",
        slug="y-cat",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    # user WITHOUT role:read
    u = User.objects.create_user(email="no@x.com", password="x", org_id=org.id)
    c = APIClient()
    c.force_authenticate(u)
    assert c.get("/api/v1/permissions/catalogue/").status_code == 403

    # user WITH role:read
    p, _ = Permission.objects.get_or_create(code="role:read", defaults={"description": "d"})
    role = Role.objects.create(org_id=org.id, code="reader", name="Reader")
    RolePermission.objects.create(role=role, permission=p)
    u2 = User.objects.create_user(email="yes@x.com", password="x", org_id=org.id)
    UserRole.objects.create(user=u2, role=role)
    c2 = APIClient()
    c2.force_authenticate(u2)
    r = c2.get("/api/v1/permissions/catalogue/")
    assert r.status_code == 200
    body = r.json()
    assert "modules" in body and isinstance(body["modules"], list)
    # each module has permissions with description + scope keys
    sample = body["modules"][0]["permissions"][0]
    assert {"code", "label", "description", "scope", "requires", "dangerous"} <= set(sample)
