"""Password strength policy is enforced on user-facing set/change paths.

Root cause it guards: Django's ``set_password`` never runs
AUTH_PASSWORD_VALIDATORS, so before this the change/reset/invite-activate
endpoints accepted "password". The validators are wired in via
serializers.validate_password_strength.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import User
from modules.identity.serializers import validate_password_strength

pytestmark = pytest.mark.django_db


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


def _authed_temp_user(client: APIClient, org_id: uuid.UUID) -> User:
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
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}")
    return user


# --- unit: the shared validator ------------------------------------------------


@pytest.mark.parametrize(
    "weak",
    [
        "password",  # common
        "short1A!",  # < 10 chars  # pragma: allowlist secret
        "1234567890",  # all numeric
        "password123",  # common-ish + no complexity  # pragma: allowlist secret
    ],
)
def test_validator_rejects_weak(weak: str) -> None:
    from rest_framework import serializers as drf

    with pytest.raises(drf.ValidationError):
        validate_password_strength(weak)


def test_validator_accepts_strong() -> None:
    strong = "br@nd-new-p@ss"  # pragma: allowlist secret
    assert validate_password_strength(strong) == strong


# --- endpoint: change password -------------------------------------------------


def test_change_password_rejects_weak(client: APIClient, org_id: uuid.UUID) -> None:
    user = _authed_temp_user(client, org_id)
    resp = client.post(
        "/api/v1/auth/password/change",
        {"new_password": "password"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 400, resp.content
    user.refresh_from_db()
    # flag stays set — the weak change did not go through
    assert user.must_change_password is True


def test_change_password_accepts_strong(client: APIClient, org_id: uuid.UUID) -> None:
    _authed_temp_user(client, org_id)
    resp = client.post(
        "/api/v1/auth/password/change",
        {"new_password": "br@nd-new-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
