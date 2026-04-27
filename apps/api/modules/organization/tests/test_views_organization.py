"""Tests for the OrganizationViewSet."""

import pytest
from rest_framework.test import APIClient

from modules.organization.models import Organization


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
def test_list_organizations_returns_seeded_org(client: APIClient, org: Organization) -> None:
    resp = client.get("/api/v1/organizations/")
    assert resp.status_code == 200
    data = resp.json()
    slugs = [r["slug"] for r in data["results"]] if "results" in data else [r["slug"] for r in data]
    assert "provintell" in slugs


@pytest.mark.django_db
def test_retrieve_organization_by_slug(client: APIClient, org: Organization) -> None:
    resp = client.get("/api/v1/organizations/provintell/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "provintell"
    assert body["country_code"] == "MY"


@pytest.mark.django_db
def test_retrieve_unknown_returns_404(client: APIClient) -> None:
    resp = client.get("/api/v1/organizations/nonexistent/")
    assert resp.status_code == 404
