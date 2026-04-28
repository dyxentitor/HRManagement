"""notify() service + preferences."""

import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.identity.models import User
from modules.notification.models import Notification, NotificationPreference
from modules.notification.services.notify import notify
from modules.notification.services.preferences import is_enabled, seed_for_user


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def user():
    return User.objects.create_user(
        email="u@x.com", password="x", org_id=uuid.uuid4()
    )  # pragma: allowlist secret


@pytest.mark.django_db
def test_user_create_seeds_preferences(user):
    """The post_save signal should seed default preferences on user create."""
    # User fixture already created the user, signal fired
    assert NotificationPreference.objects.filter(user=user).count() > 0


@pytest.mark.django_db
def test_notify_creates_in_app_and_email(user):
    """Default for leave.approved is in_app=True, email=True."""
    rows = notify(
        user=user,
        type="leave.approved",
        payload={"leave_id": "abc"},
        deep_link="/leave/me",
    )
    assert len(rows) == 2
    assert {r.channel for r in rows} == {"in_app", "email"}


@pytest.mark.django_db
def test_notify_respects_disabled_preference(user):
    """If user disables email for leave.approved, no email row created."""
    NotificationPreference.objects.update_or_create(
        user=user,
        type="leave.approved",
        channel="email",
        defaults={"enabled": False},
    )
    rows = notify(user=user, type="leave.approved", payload={})
    assert len(rows) == 1
    assert rows[0].channel == "in_app"


@pytest.mark.django_db
def test_security_type_cannot_be_disabled(user):
    """Even if disabled in preferences, security-relevant types always send."""
    NotificationPreference.objects.update_or_create(
        user=user,
        type="auth.password_changed",
        channel="email",
        defaults={"enabled": False},
    )
    assert is_enabled(user=user, type_code="auth.password_changed", channel="email") is True

    rows = notify(user=user, type="auth.password_changed", payload={})
    channels = {r.channel for r in rows}
    assert "email" in channels


@pytest.mark.django_db
def test_unknown_type_uses_default_true(user):
    rows = notify(user=user, type="some.new.type", payload={})
    assert len(rows) == 2  # in_app + email both default True


@pytest.mark.django_db
def test_seed_for_user_is_idempotent(user):
    """Calling seed_for_user twice on the same user should not create duplicates."""
    count_first = NotificationPreference.objects.filter(user=user).count()
    seed_for_user(user)
    count_second = NotificationPreference.objects.filter(user=user).count()
    assert count_first == count_second
    assert count_first > 0


@pytest.mark.django_db
def test_notification_str(user):
    n = Notification.objects.create(
        org_id=user.org_id, user=user, type="leave.approved", channel="in_app", payload={}
    )
    assert str(n) == "leave.approved/in_app/u@x.com"
