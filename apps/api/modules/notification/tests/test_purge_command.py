"""Tests for the purge_notification_type management command."""

from __future__ import annotations

import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import User
from modules.notification.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def a_user():
    """A minimal user for notification fixture rows."""
    return User.objects.create_user(
        email="purge_test@example.com",
        password="x",  # pragma: allowlist secret
        org_id=uuid.uuid4(),
    )


def test_purge_notification_type(a_user):
    Notification.objects.create(
        org_id=a_user.org_id,
        user=a_user,
        type="feedback.status_changed",
        channel="in_app",
    )
    call_command("purge_notification_type", "feedback.status_changed")
    assert not Notification.objects.filter(type="feedback.status_changed").exists()
    call_command("purge_notification_type", "feedback.status_changed")  # idempotent, no error
