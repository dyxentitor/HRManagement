"""Endpoint tests for /api/v1/teams/."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Team
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(db):
    org = Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    set_current_org_id(org.id)
    user = User.objects.create_user(
        email="a@a.com",
        password="p!",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="org_admin", name="A", is_system=True)
    pr, _ = Permission.objects.get_or_create(code="team:read")
    pw, _ = Permission.objects.get_or_create(code="team:write")
    RolePermission.objects.create(role=role, permission=pr)
    RolePermission.objects.create(role=role, permission=pw)
    UserRole.objects.create(user=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return org, user, client


URL = "/api/v1/teams/"


def test_list_teams_empty(setup):
    _, _, client = setup
    resp = client.get(URL)
    assert resp.status_code == 200
    body = resp.json()
    # Some envs return list directly; some paginate. Handle both.
    items = body if isinstance(body, list) else body.get("results", [])
    assert items == []


def test_create_team(setup):
    org, _, client = setup
    resp = client.post(URL, {"name": "Focus", "sort_order": 1, "min_headcount": 2}, format="json")
    assert resp.status_code == 201, resp.json()
    assert Team.all_objects.filter(org_id=org.id, name="Focus").exists()


def test_update_team(setup):
    org, _, client = setup
    t = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)
    resp = client.patch(f"{URL}{t.id}/", {"min_headcount": 3}, format="json")
    assert resp.status_code == 200, resp.json()
    t.refresh_from_db()
    assert t.min_headcount == 3


def test_delete_team(setup):
    org, _, client = setup
    t = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)
    resp = client.delete(f"{URL}{t.id}/")
    assert resp.status_code in (200, 204)
    # Soft-deleted via TenantBaseModel
    assert not Team.objects.filter(id=t.id).exists()


def test_team_write_requires_perm(setup):
    org, user, client = setup
    UserRole.objects.filter(user=user).delete()
    resp = client.post(URL, {"name": "X", "sort_order": 0}, format="json")
    assert resp.status_code == 403
