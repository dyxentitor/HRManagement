"""Notification models tests."""

import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.identity.models import User
from modules.notification.models import (
    EmailDigestRun,
    Notification,
    NotificationPreference,
)


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
def test_notification_create(user):
    n = Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="leave.approved",
        channel="in_app",
        payload={"leave_id": str(uuid.uuid4())},
        deep_link="/leave/me",
    )
    assert n.read_at is None
    assert n.priority == "normal"


@pytest.mark.django_db
def test_notification_mark_read(user):
    n = Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="x",
        channel="in_app",
        payload={},
    )
    n.mark_read()
    n.refresh_from_db()
    assert n.read_at is not None


@pytest.mark.django_db
def test_preference_unique_per_user_type_channel(user):
    # Signal already seeded preferences on user create; delete the relevant row first
    NotificationPreference.objects.filter(
        user=user, type="leave.approved", channel="email"
    ).delete()
    NotificationPreference.objects.create(
        user=user, type="leave.approved", channel="email", enabled=True
    )
    with pytest.raises(IntegrityError):
        NotificationPreference.objects.create(
            user=user, type="leave.approved", channel="email", enabled=False
        )


@pytest.mark.django_db
def test_email_digest_run(user):
    n = Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="x",
        channel="in_app",
        payload={},
    )
    run = EmailDigestRun.objects.create(
        org_id=user.org_id,
        user=user,
        notification_count=1,
    )
    run.notifications.add(n)
    assert run.notifications.count() == 1


@pytest.mark.django_db
def test_priority_choices(user):
    n = Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="x",
        channel="in_app",
        payload={},
        priority="urgent",
    )
    assert n.priority == "urgent"
