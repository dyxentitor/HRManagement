"""Integration tests for /api/v1/announcements/*."""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from modules.announcements.models import Announcement
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},
        format="json",
    ).json()
    return body["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug=f"x-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    hr_user = User.objects.create_user(
        email="hr@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    hr_role = Role.objects.create(org_id=org.id, code="hr", name="HR", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=False)
    UserRole.objects.create(user=hr_user, role=hr_role)
    UserRole.objects.create(user=emp_user, role=emp_role)
    _grant(hr_role, "announcement:read", "announcement:write")
    _grant(emp_role, "announcement:read")
    return {"org": org}


@pytest.mark.django_db
def test_hr_creates_announcement(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'hr@x.com')}")
    resp = client.post(
        "/api/v1/announcements/",
        {"title": "New policy", "body": "Read it", "category": "policy", "pinned": True},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["title"] == "New policy"
    assert body["pinned"] is True


@pytest.mark.django_db
def test_employee_can_read_but_not_write(stack):
    org = stack["org"]
    Announcement.all_objects.create(org_id=org.id, title="Hi", body="b", category="general")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'emp@x.com')}")
    # read OK
    resp = client.get("/api/v1/announcements/")
    assert resp.status_code == 200
    rows = resp.json()
    rows = rows.get("results") if isinstance(rows, dict) else rows
    assert len(rows) == 1
    # write forbidden
    resp = client.post(
        "/api/v1/announcements/",
        {"title": "X", "body": "Y", "category": "general"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_pinned_sorts_first(stack):
    org = stack["org"]
    Announcement.all_objects.create(org_id=org.id, title="plain", body="b", pinned=False)
    Announcement.all_objects.create(org_id=org.id, title="pinned", body="b", pinned=True)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'hr@x.com')}")
    resp = client.get("/api/v1/announcements/")
    rows = resp.json()
    rows = rows.get("results") if isinstance(rows, dict) else rows
    assert rows[0]["title"] == "pinned"
