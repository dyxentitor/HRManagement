"""End-to-end tests for the feature-flag API endpoints."""

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


@pytest.fixture
def admin(org):
    u = User.objects.create_user(
        email="admin@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    UserRole.objects.create(user=u, role=Role.objects.get(org_id=org.id, code="org_admin"))
    return u


def _login(client, email):
    resp = client.post(
        "/api/v1/auth/login", {"email": email, "password": "x"}, format="json"
    )  # pragma: allowlist secret
    return resp.json()["access_token"]


@pytest.mark.django_db
def test_list_returns_15_entries(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.get("/api/v1/org/feature-flags/")
    assert resp.status_code == 200
    assert len(resp.json()) == 15


@pytest.mark.django_db
def test_patch_toggles_module(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 200
    by_key = {e["key"]: e for e in resp.json()}
    assert by_key["claims"]["enabled"] is False


@pytest.mark.django_db
def test_patch_critical_rejected(admin):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/identity/", {"enabled": False}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_employee_cannot_patch(org):
    """Employee role lacks org:feature_flag:write — must 403."""
    emp = User.objects.create_user(
        email="e@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    UserRole.objects.create(user=emp, role=Role.objects.get(org_id=org.id, code="employee"))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'e@x.com')}")
    resp = client.patch("/api/v1/org/feature-flags/claims/", {"enabled": False}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_list_visible_to_any_authenticated_user(org):
    """Non-admin authenticated users must read flag state so the UI can hide
    disabled modules. Flags describe org-level UI visibility, not secrets."""
    emp = User.objects.create_user(
        email="reader@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    UserRole.objects.create(user=emp, role=Role.objects.get(org_id=org.id, code="employee"))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'reader@x.com')}")
    resp = client.get("/api/v1/org/feature-flags/")
    assert resp.status_code == 200
    assert len(resp.json()) == 15
