"""Tests for MFA TOTP enrollment, verification, and login MFA challenge."""

import uuid

import pyotp
import pytest
from rest_framework.test import APIClient

from modules.identity.models import MFADevice, User


@pytest.fixture(autouse=True)
def _set_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure HRMS_FIELD_ENCRYPTION_KEY is set for EncryptedCharField."""
    monkeypatch.setenv(
        "HRMS_FIELD_ENCRYPTION_KEY",
        "I1aD206iY5i0LqFsNDKqxcpxmE3fGHwjhM0BgBB8tOg=",  # pragma: allowlist secret
    )


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="bob@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret


def _login(client: APIClient, email: str, password: str) -> dict:
    return client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()


@pytest.mark.django_db
def test_enable_mfa_returns_provisioning_uri(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    resp = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert "secret" in body  # base32 secret for the user to copy if QR fails


@pytest.mark.django_db
def test_confirm_mfa_marks_device_confirmed_and_user_enabled(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    code = pyotp.TOTP(secret).now()

    resp = client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": code},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.mfa_enabled is True
    assert MFADevice.objects.get(user=user).confirmed_at is not None


@pytest.mark.django_db
def test_confirm_mfa_rejects_bad_code(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    resp = client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": "000000"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_disable_mfa_clears_device(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": pyotp.TOTP(secret).now()},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )

    resp = client.delete(
        "/api/v1/auth/mfa",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code in (200, 204)
    user.refresh_from_db()
    assert user.mfa_enabled is False
    assert MFADevice.objects.filter(user=user).count() == 0


@pytest.mark.django_db
def test_login_returns_mfa_required_when_enabled(client: APIClient, user: User) -> None:
    user.mfa_enabled = True
    user.save()
    body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    assert body["mfa_required"] is True
    assert body["access_token"] == ""
    assert body["refresh_token"] == ""
    assert "mfa_token" in body and len(body["mfa_token"]) > 16


@pytest.mark.django_db
def test_login_mfa_step_completes_with_valid_totp(client: APIClient, user: User) -> None:
    """Full flow: login -> mfa_token -> POST mfa with code -> tokens issued."""
    # Set up an MFA device via the enable+confirm flow
    setup_tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {setup_tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": pyotp.TOTP(secret).now()},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {setup_tokens['access_token']}",
    )

    # Now log in fresh — should get mfa_token
    login_body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    assert login_body["mfa_required"] is True
    mfa_token = login_body["mfa_token"]

    # Complete the MFA step
    resp = client.post(
        "/api/v1/auth/login/mfa",
        {"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "access_token" in body and "refresh_token" in body


@pytest.mark.django_db
def test_login_mfa_step_rejects_bad_code(client: APIClient, user: User) -> None:
    user.mfa_enabled = True
    user.save()
    secret = pyotp.random_base32()
    MFADevice.objects.create(user=user, secret=secret, confirmed_at=user.created_at)

    body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    resp = client.post(
        "/api/v1/auth/login/mfa",
        {"mfa_token": body["mfa_token"], "code": "000000"},
        format="json",
    )
    assert resp.status_code == 401
