"""Endpoint tests for GET /api/v1/schedule/calendar/."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Team
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_setup(db):
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
        email="admin@acme.test",
        password="Password123!",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id,
        code="org_admin",
        name="Org Admin",
        is_system=True,
    )
    p, _ = Permission.objects.get_or_create(
        code="schedule:assignment:read:team", defaults={"description": ""}
    )
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    Department.all_objects.create(org_id=org.id, name="Ops")
    Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)
    client = APIClient()
    client.force_authenticate(user=user)
    return org, user, client


CAL_URL = "/api/v1/schedule/shift-assignments/calendar/"


def test_calendar_endpoint_returns_payload(admin_setup):
    _, _, client = admin_setup
    resp = client.get(f"{CAL_URL}?from=2026-03-01&to=2026-03-31")
    assert resp.status_code == 200
    body = resp.json()
    assert "teams" in body
    assert "shifts" in body
    assert "assignments" in body
    assert "leaves" in body
    assert "holidays" in body
    assert "stats" in body


def test_calendar_endpoint_requires_auth():
    client = APIClient()
    resp = client.get(f"{CAL_URL}?from=2026-03-01&to=2026-03-31")
    assert resp.status_code in (401, 403)


def test_calendar_endpoint_requires_read_team_perm(admin_setup):
    _, user, client = admin_setup
    UserRole.objects.filter(user=user).delete()
    resp = client.get(f"{CAL_URL}?from=2026-03-01&to=2026-03-31")
    assert resp.status_code == 403


def test_calendar_endpoint_filters_by_team(admin_setup):
    org, _, client = admin_setup
    other = Team.all_objects.create(org_id=org.id, name="Other", sort_order=1)
    resp = client.get(f"{CAL_URL}?from=2026-03-01&to=2026-03-31&team_id={other.id}")
    assert resp.status_code == 200
    teams = resp.json()["teams"]
    # Only the filtered team (and possibly Unassigned) should appear
    real_team_ids = [t["id"] for t in teams if t["id"]]
    assert real_team_ids == [str(other.id)]


def test_calendar_endpoint_400_on_missing_dates(admin_setup):
    _, _, client = admin_setup
    resp = client.get(CAL_URL)
    assert resp.status_code == 400


def test_calendar_endpoint_400_on_invalid_dates(admin_setup):
    _, _, client = admin_setup
    resp = client.get(f"{CAL_URL}?from=not-a-date&to=2026-03-31")
    assert resp.status_code == 400


def test_calendar_endpoint_perf_query_count(admin_setup, django_assert_max_num_queries):
    _, _, client = admin_setup
    with django_assert_max_num_queries(15):
        resp = client.get(f"{CAL_URL}?from=2026-03-01&to=2026-03-31")
    assert resp.status_code == 200
