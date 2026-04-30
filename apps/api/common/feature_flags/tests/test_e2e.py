"""End-to-end: PATCH the feature-flag, hit a module endpoint, expect 403,
then re-enable, expect 200."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.identity.models import Role, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture(autouse=True)
def seed(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))


def _admin(org):
    u = User.objects.create_user(
        email="admin@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    UserRole.objects.create(user=u, role=Role.objects.get(org_id=org.id, code="org_admin"))
    return u


def _login(client, email="admin@x.com"):
    resp = client.post(
        "/api/v1/auth/login", {"email": email, "password": "x"}, format="json"
    )  # pragma: allowlist secret
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_disable_module_then_endpoint_returns_403(org):
    _admin(org)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client)}")

    resp = client.get("/api/v1/claims/")
    assert resp.status_code in (200, 403, 404)
    initial_status = resp.status_code

    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 200

    resp = client.get("/api/v1/claims/")
    assert resp.status_code == 403
    assert "claims" in resp.json()["detail"].lower()
    assert "disabled" in resp.json()["detail"].lower()

    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": True}, format="json")
    assert resp.status_code == 200

    resp = client.get("/api/v1/claims/")
    assert resp.status_code == initial_status
