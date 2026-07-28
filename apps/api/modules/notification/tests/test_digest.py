"""Email digest service tests."""

from __future__ import annotations

import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core import mail

from modules.identity.models import User
from modules.notification.models import EmailDigestRun, Notification
from modules.notification.services.digest import send_digests


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def user():
    return User.objects.create_user(
        email="digest@x.com", password="x", org_id=uuid.uuid4()
    )  # pragma: allowlist secret


def _pending_email(user, notif_type="leave.approved"):
    return Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type=notif_type,
        channel="email",
        delivery_status="pending",
        payload={"msg": "test"},
    )


@pytest.mark.django_db
def test_digest_sends_one_email_per_user(user):
    """One digest email per user with pending rows."""
    _pending_email(user, "leave.approved")
    _pending_email(user, "claim.approved")
    result = send_digests()
    assert result["users"] == 1
    assert result["notifications"] == 2
    assert len(mail.outbox) == 1
    assert "2 new notification" in mail.outbox[0].subject


@pytest.mark.django_db
def test_digest_marks_notifications_sent_and_creates_run(user):
    """After digest, notifications are marked sent and EmailDigestRun created."""
    n = _pending_email(user)
    send_digests()
    n.refresh_from_db()
    assert n.delivery_status == "sent"
    assert n.sent_at is not None
    run = EmailDigestRun.objects.filter(user=user).first()
    assert run is not None
    assert run.notification_count == 1
    assert run.notifications.count() == 1


@pytest.mark.django_db
def test_digest_skips_user_without_email():
    """User with no email gets notifications marked skipped."""
    org_id = uuid.uuid4()
    # Create a user manually without triggering signal issues
    user = User.objects.create_user(
        email="skip@x.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    # Blank the email after creation
    User.objects.filter(pk=user.pk).update(email="")
    user.refresh_from_db()
    n = Notification.objects.create(
        org_id=org_id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="pending",
        payload={},
    )
    send_digests()
    n.refresh_from_db()
    assert n.delivery_status == "skipped"


@pytest.mark.django_db
def test_digest_empty_queue():
    """No pending email notifications => no-op."""
    result = send_digests()
    assert result == {"users": 0, "notifications": 0}


@pytest.fixture
def user_with_pending_email_notif(user):
    """User with a single pending email-channel Notification."""
    return _pending_email(user)


@pytest.mark.django_db
def test_digest_bounded_retry(monkeypatch, user_with_pending_email_notif):
    """Failed send increments send_attempts; stays pending until attempt 3, then fails."""
    import modules.notification.services.digest as d

    def boom(**k):
        raise RuntimeError("smtp")

    monkeypatch.setattr(d, "mail_send", boom)
    n = user_with_pending_email_notif
    for expected in (1, 2):
        d.send_digests()
        n.refresh_from_db()
        assert n.send_attempts == expected and n.delivery_status == "pending"
    d.send_digests()
    n.refresh_from_db()
    assert n.send_attempts == 3 and n.delivery_status == "failed"
