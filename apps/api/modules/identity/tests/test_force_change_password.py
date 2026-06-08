"""Force-change-password flow: login surfaces the flag + authenticated change endpoint."""

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import User


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_login_reports_must_change(client: APIClient, org_id: uuid.UUID) -> None:
    User.objects.create_user(
        email="temp@example.com",
        password="t3mp-p@ss",  # pragma: allowlist secret
        org_id=org_id,
        must_change_password=True,
    )
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "temp@example.com", "password": "t3mp-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["must_change_password"] is True


@pytest.mark.django_db
def test_login_reports_false_for_normal_user(client: APIClient, org_id: uuid.UUID) -> None:
    User.objects.create_user(
        email="normal@example.com",
        password="n0rmal-p@ss",  # pragma: allowlist secret
        org_id=org_id,
    )
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "normal@example.com", "password": "n0rmal-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["must_change_password"] is False


@pytest.mark.django_db
def test_change_password_clears_flag(client: APIClient, org_id: uuid.UUID) -> None:
    user = User.objects.create_user(
        email="temp@example.com",
        password="t3mp-p@ss",  # pragma: allowlist secret
        org_id=org_id,
        must_change_password=True,
    )
    login = client.post(
        "/api/v1/auth/login",
        {"email": "temp@example.com", "password": "t3mp-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    token = login.data["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    resp = client.post(
        "/api/v1/auth/password/change",
        {"new_password": "br@nd-new-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content

    user.refresh_from_db()
    assert user.must_change_password is False
    assert user.check_password("br@nd-new-p@ss") is True  # pragma: allowlist secret


@pytest.mark.django_db
def test_change_password_requires_auth(client: APIClient) -> None:
    resp = client.post(
        "/api/v1/auth/password/change",
        {"new_password": "br@nd-new-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code in (401, 403)
