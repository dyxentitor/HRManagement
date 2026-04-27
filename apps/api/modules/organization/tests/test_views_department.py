"""Tests for the DepartmentViewSet."""

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def org(org_id: uuid.UUID) -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def auth_client(db, org_id: uuid.UUID) -> APIClient:
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
def test_create_department(auth_client: APIClient, org_id: uuid.UUID) -> None:
    resp = auth_client.post(
        "/api/v1/departments/",
        {"name": "Operations"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["name"] == "Operations"


@pytest.mark.django_db
def test_create_department_without_auth_fails() -> None:
    anon = APIClient()
    resp = anon.post("/api/v1/departments/", {"name": "Operations"}, format="json")
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_list_departments(auth_client: APIClient, org_id: uuid.UUID) -> None:
    Department.objects.create(org_id=org_id, name="Operations")
    Department.objects.create(org_id=org_id, name="Engineering")
    resp = auth_client.get("/api/v1/departments/")
    assert resp.status_code == 200
    data = resp.json()
    rows = data.get("results") if isinstance(data, dict) else data
    names = [r["name"] for r in rows]
    assert "Operations" in names and "Engineering" in names


@pytest.mark.django_db
def test_retrieve_department(auth_client: APIClient, org_id: uuid.UUID) -> None:
    d = Department.objects.create(org_id=org_id, name="HR")
    resp = auth_client.get(f"/api/v1/departments/{d.id}/")
    assert resp.status_code == 200
    assert resp.json()["name"] == "HR"


@pytest.mark.django_db
def test_update_department(auth_client: APIClient, org_id: uuid.UUID) -> None:
    d = Department.objects.create(org_id=org_id, name="HR")
    resp = auth_client.patch(
        f"/api/v1/departments/{d.id}/",
        {"name": "People & Culture"},
        format="json",
    )
    assert resp.status_code == 200
    d.refresh_from_db()
    assert d.name == "People & Culture"


@pytest.mark.django_db
def test_soft_delete_department(auth_client: APIClient, org_id: uuid.UUID) -> None:
    d = Department.objects.create(org_id=org_id, name="HR")
    resp = auth_client.delete(f"/api/v1/departments/{d.id}/")
    assert resp.status_code in (200, 204)
    d_fresh = Department.all_objects.get(pk=d.pk)
    assert d_fresh.deleted_at is not None
