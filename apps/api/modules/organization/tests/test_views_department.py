"""Tests for the DepartmentViewSet."""

import pytest
from rest_framework.test import APIClient

from modules.organization.models import Department, Organization


@pytest.fixture
def client() -> APIClient:
    return APIClient()


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


@pytest.mark.django_db
def test_create_department(client: APIClient, org: Organization) -> None:
    resp = client.post(
        "/api/v1/departments/",
        {"name": "Operations", "org_id": str(org.id)},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["name"] == "Operations"


@pytest.mark.django_db
def test_create_department_without_org_id_fails(client: APIClient) -> None:
    resp = client.post("/api/v1/departments/", {"name": "Operations"}, format="json")
    assert resp.status_code in (400, 422)


@pytest.mark.django_db
def test_list_departments(client: APIClient, org: Organization) -> None:
    Department.all_objects.create(org_id=org.id, name="Operations")
    Department.all_objects.create(org_id=org.id, name="Engineering")
    resp = client.get("/api/v1/departments/")
    assert resp.status_code == 200
    data = resp.json()
    rows = data.get("results") if isinstance(data, dict) else data
    names = [r["name"] for r in rows]
    assert "Operations" in names and "Engineering" in names


@pytest.mark.django_db
def test_retrieve_department(client: APIClient, org: Organization) -> None:
    d = Department.all_objects.create(org_id=org.id, name="HR")
    resp = client.get(f"/api/v1/departments/{d.id}/")
    assert resp.status_code == 200
    assert resp.json()["name"] == "HR"


@pytest.mark.django_db
def test_update_department(client: APIClient, org: Organization) -> None:
    d = Department.all_objects.create(org_id=org.id, name="HR")
    resp = client.patch(
        f"/api/v1/departments/{d.id}/",
        {"name": "People & Culture"},
        format="json",
    )
    assert resp.status_code == 200
    d.refresh_from_db()
    assert d.name == "People & Culture"


@pytest.mark.django_db
def test_soft_delete_department(client: APIClient, org: Organization) -> None:
    d = Department.all_objects.create(org_id=org.id, name="HR")
    resp = client.delete(f"/api/v1/departments/{d.id}/")
    assert resp.status_code in (200, 204)
    d.refresh_from_db()
    assert d.deleted_at is not None
