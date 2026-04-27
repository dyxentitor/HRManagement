"""Tests for the Session model + sessions service."""

import hashlib
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from modules.identity.models import User
from modules.identity.services.sessions import (
    create_session,
    revoke_all_user_sessions,
    revoke_session,
)


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="u@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret


@pytest.mark.django_db
def test_session_created_with_refresh_token_hash(user: User) -> None:
    refresh = "test.refresh.token"  # pragma: allowlist secret
    s = create_session(user, refresh_token=refresh, ip="127.0.0.1", user_agent="pytest")
    assert s.user == user
    expected_hash = hashlib.sha256(refresh.encode()).hexdigest()
    assert s.refresh_token_hash == expected_hash
    assert s.revoked_at is None


@pytest.mark.django_db
def test_revoke_session_stamps_revoked_at(user: User) -> None:
    s = create_session(user, refresh_token="t", ip="1.1.1.1", user_agent="x")
    revoke_session(s.id)
    s.refresh_from_db()
    assert s.revoked_at is not None


@pytest.mark.django_db
def test_revoke_all_user_sessions(user: User, org_id: uuid.UUID) -> None:
    other_user = User.objects.create_user(
        email="o@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    s1 = create_session(user, refresh_token="t1", ip="1.1.1.1", user_agent="x")
    s2 = create_session(user, refresh_token="t2", ip="1.1.1.1", user_agent="x")
    s3 = create_session(other_user, refresh_token="t3", ip="1.1.1.1", user_agent="x")

    revoke_all_user_sessions(user)

    s1.refresh_from_db()
    s2.refresh_from_db()
    s3.refresh_from_db()
    assert s1.revoked_at is not None
    assert s2.revoked_at is not None
    assert s3.revoked_at is None  # different user


@pytest.mark.django_db
def test_session_expires_at_set(user: User) -> None:
    s = create_session(user, refresh_token="t", ip="1.1.1.1", user_agent="x")
    delta = s.expires_at - timezone.now()
    # Default REFRESH_TOKEN_LIFETIME is 7 days per SIMPLE_JWT settings
    assert timedelta(days=6) < delta < timedelta(days=8)
