"""Notification endpoint tests."""

from __future__ import annotations

import os
import uuid

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.identity.models import User
from modules.notification.models import Notification, NotificationPreference


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def user():
    return User.objects.create_user(
        email="notif@x.com", password="testpass", org_id=uuid.uuid4()
    )  # pragma: allowlist secret


@pytest.fixture
def authed_client(user):
    client = APIClient()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "notif@x.com", "password": "testpass"},  # pragma: allowlist secret
        format="json",
    )
    token = resp.json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def _make_in_app(user, notif_type="leave.approved", read=False):
    from django.utils import timezone

    return Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type=notif_type,
        channel="in_app",
        payload={"test": True},
        read_at=timezone.now() if read else None,
    )


@pytest.mark.django_db
def test_list_own_notifications(authed_client, user):
    _make_in_app(user)
    _make_in_app(user)
    resp = authed_client.get("/api/v1/notifications")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.django_db
def test_mark_single_read(authed_client, user):
    n = _make_in_app(user)
    resp = authed_client.patch(f"/api/v1/notifications/{n.id}/read")
    assert resp.status_code == 200
    assert resp.json()["read_at"] is not None


@pytest.mark.django_db
def test_mark_all_read(authed_client, user):
    _make_in_app(user)
    _make_in_app(user)
    resp = authed_client.post("/api/v1/notifications/read-all")
    assert resp.status_code == 200
    assert resp.json()["updated"] >= 2


@pytest.mark.django_db
def test_unread_count(authed_client, user):
    _make_in_app(user, read=False)
    _make_in_app(user, read=False)
    _make_in_app(user, read=True)
    resp = authed_client.get("/api/v1/notifications/unread-count")
    assert resp.status_code == 200
    assert resp.json() == {"count": 2}


@pytest.mark.django_db
def test_unread_count_updates_after_read(authed_client, user):
    n = _make_in_app(user, read=False)
    authed_client.patch(f"/api/v1/notifications/{n.id}/read")
    resp = authed_client.get("/api/v1/notifications/unread-count")
    assert resp.json() == {"count": 0}


@pytest.mark.django_db
def test_get_preferences(authed_client, user):
    resp = authed_client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    # Signal seeded preferences on user create
    assert len(resp.json()) > 0


@pytest.mark.django_db
def test_bulk_update_preferences(authed_client, user):
    """PATCH preferences updates enabled flag; security types ignored when disabling."""
    # Ensure prefs exist for leave.approved email
    NotificationPreference.objects.update_or_create(
        user=user,
        type="leave.approved",
        channel="email",
        defaults={"enabled": True},
    )
    payload = [
        {"type": "leave.approved", "channel": "email", "enabled": False},
        # security type — should be ignored when disabled
        {"type": "auth.password_changed", "channel": "email", "enabled": False},
    ]
    resp = authed_client.patch("/api/v1/notifications/preferences", payload, format="json")
    assert resp.status_code == 200
    # leave.approved email should be disabled
    pref = NotificationPreference.objects.get(user=user, type="leave.approved", channel="email")
    assert pref.enabled is False
    # auth.password_changed should NOT have been updated (security type)
    sec_pref = NotificationPreference.objects.filter(
        user=user, type="auth.password_changed", channel="email"
    ).first()
    if sec_pref:
        assert sec_pref.enabled is True
