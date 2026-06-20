"""Integration tests for /api/v1/onboarding/*."""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.onboarding.models import OnboardingChecklist
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
    _grant(hr_role, "onboarding:read", "onboarding:write")
    _grant(emp_role, "announcement:read")  # no onboarding perms
    return {"org": org}


@pytest.mark.django_db
def test_create_seeds_default_items(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'hr@x.com')}")
    resp = client.post("/api/v1/onboarding/", {"employee_id": str(uuid.uuid4())}, format="json")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert len(body["items"]) == 6
    assert body["status"] == "in_progress"


@pytest.mark.django_db
def test_toggle_all_items_completes_checklist(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'hr@x.com')}")
    created = client.post(
        "/api/v1/onboarding/", {"employee_id": str(uuid.uuid4())}, format="json"
    ).json()
    cid = created["id"]
    last = None
    for item in created["items"]:
        last = client.patch(f"/api/v1/onboarding/{cid}/items/{item['id']}/toggle/")
        assert last.status_code == 200, last.content
    assert last.json()["status"] == "completed"
    assert last.json()["completed_at"] is not None
    assert OnboardingChecklist.all_objects.get(id=cid).status == "completed"


@pytest.mark.django_db
def test_employee_without_perm_forbidden(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'emp@x.com')}")
    resp = client.get("/api/v1/onboarding/")
    assert resp.status_code == 403
