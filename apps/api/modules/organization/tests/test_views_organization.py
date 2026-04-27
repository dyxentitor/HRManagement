"""Tests for the OrganizationViewSet."""

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def auth_client(db) -> APIClient:
    org_id = uuid.uuid4()
    user = User.objects.create_user(
        email="reader@example.com",
        password="x",  # pragma: allowlist secret
        org_id=org_id,
    )
    role = Role.objects.create(org_id=org_id, code="org_admin", name="Org Admin", is_system=True)
    for code in ("org:settings:read", "department:read", "department:write"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    api = APIClient()
    login = api.post(
        "/api/v1/auth/login",
        {"email": "reader@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return api


@pytest.mark.django_db
def test_list_organizations_returns_seeded_org(auth_client: APIClient, org: Organization) -> None:
    resp = auth_client.get("/api/v1/organizations/")
    assert resp.status_code == 200
    data = resp.json()
    slugs = [r["slug"] for r in data["results"]] if "results" in data else [r["slug"] for r in data]
    assert "provintell" in slugs


@pytest.mark.django_db
def test_retrieve_organization_by_slug(auth_client: APIClient, org: Organization) -> None:
    resp = auth_client.get("/api/v1/organizations/provintell/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "provintell"
    assert body["country_code"] == "MY"


@pytest.mark.django_db
def test_retrieve_unknown_returns_404(auth_client: APIClient) -> None:
    resp = auth_client.get("/api/v1/organizations/nonexistent/")
    assert resp.status_code == 404
