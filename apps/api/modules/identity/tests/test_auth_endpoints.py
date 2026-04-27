"""Integration tests for the auth endpoints (login, refresh, logout, /me, password reset)."""

import uuid

import pytest
from django.core import mail
from rest_framework.test import APIClient

from modules.identity.models import Session, User


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="alice@example.com",
        password="s3cret-p@ss",  # pragma: allowlist secret
        org_id=org_id,
    )


@pytest.mark.django_db
def test_login_returns_tokens(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["mfa_required"] is False


@pytest.mark.django_db
def test_login_creates_session(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 1


@pytest.mark.django_db
def test_login_rejects_bad_password(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "wrong"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_login_increments_failed_count(client: APIClient, user: User) -> None:
    client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "wrong"},  # pragma: allowlist secret
        format="json",
    )
    user.refresh_from_db()
    assert user.failed_login_count == 1


@pytest.mark.django_db
def test_login_unknown_email_returns_401(client: APIClient) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "nobody@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_login_disabled_user_rejected(client: APIClient, user: User) -> None:
    user.status = "disabled"
    user.save()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_requires_auth(client: APIClient) -> None:
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_returns_user_info(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    access = resp.json()["access_token"]
    me = client.get("/api/v1/auth/me", HTTP_AUTHORIZATION=f"Bearer {access}")
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "alice@example.com"
    assert "id" in body and "org_id" in body
    assert "permissions" in body
    assert body["mfa_enabled"] is False


@pytest.mark.django_db
def test_refresh_rotates_token(client: APIClient, user: User) -> None:
    login = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    ).json()
    refresh = login["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", {"refresh_token": refresh}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body and "refresh_token" in body
    assert body["refresh_token"] != refresh  # rotation


@pytest.mark.django_db
def test_logout_revokes_session(client: APIClient, user: User) -> None:
    login = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    ).json()
    access = login["access_token"]
    refresh = login["refresh_token"]

    resp = client.post(
        "/api/v1/auth/logout",
        {"refresh_token": refresh},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {access}",
    )
    assert resp.status_code in (200, 204)
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 0


@pytest.mark.django_db
def test_password_forgot_sends_email(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/password/forgot", {"email": "alice@example.com"}, format="json"
    )
    assert resp.status_code == 200
    assert len(mail.outbox) == 1
    assert "alice@example.com" in mail.outbox[0].to


@pytest.mark.django_db
def test_password_forgot_unknown_email_still_returns_200(client: APIClient) -> None:
    """Don't leak whether an email is registered."""
    resp = client.post(
        "/api/v1/auth/password/forgot", {"email": "ghost@example.com"}, format="json"
    )
    assert resp.status_code == 200
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_password_reset_sets_new_password(client: APIClient, user: User) -> None:
    """End-to-end reset: forgot -> capture token from email -> reset -> login with new password."""
    client.post("/api/v1/auth/password/forgot", {"email": "alice@example.com"}, format="json")
    body = mail.outbox[0].body
    # The email body contains the token. Format expectation: "token: <token>"
    import re

    m = re.search(r"token:\s*(\S+)", body)
    assert m is not None
    token = m.group(1)

    resp = client.post(
        "/api/v1/auth/password/reset",
        {"token": token, "new_password": "newp@ss-w0rd"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200

    # Old password no longer works
    bad = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert bad.status_code == 401

    # New password works
    good = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "newp@ss-w0rd"},  # pragma: allowlist secret
        format="json",
    )
    assert good.status_code == 200
