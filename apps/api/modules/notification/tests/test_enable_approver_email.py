"""Tests for the enable_approver_email management command."""

from __future__ import annotations

import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import User
from modules.notification.models import NotificationPreference
from modules.notification.services.preferences import seed_for_user

pytestmark = pytest.mark.django_db

APPROVER_TYPES = [
    "leave.submitted",
    "claim.submitted",
    "incentive.claim_submitted",
    "kpi.review_submitted_self",
]


@pytest.fixture
def a_user():
    """A minimal user with seeded notification preferences."""
    user = User.objects.create_user(
        email="approver_email_test@example.com",
        password="x",  # pragma: allowlist secret
        org_id=uuid.uuid4(),
    )
    seed_for_user(user)
    return user


def test_enable_approver_email_flips_existing_and_is_idempotent(a_user):
    # Simulate pre-change state: force the 4 email rows to disabled
    NotificationPreference.objects.filter(
        user=a_user,
        type__in=APPROVER_TYPES,
        channel="email",
    ).update(enabled=False)

    # Confirm they are disabled before running the command
    for t in APPROVER_TYPES:
        pref = NotificationPreference.objects.get(user=a_user, type=t, channel="email")
        assert pref.enabled is False, f"{t} email should be disabled before command"

    # Run the command
    call_command("enable_approver_email")

    # All 4 types should now be enabled
    for t in APPROVER_TYPES:
        pref = NotificationPreference.objects.get(user=a_user, type=t, channel="email")
        assert pref.enabled is True, f"{t} email should be enabled after command"

    # Idempotent: second run flips 0 rows (no error)
    call_command("enable_approver_email")

    # Still all enabled
    for t in APPROVER_TYPES:
        pref = NotificationPreference.objects.get(user=a_user, type=t, channel="email")
        assert pref.enabled is True, f"{t} email should still be enabled after second run"


def test_new_user_seeds_approver_email_enabled():
    """New users seeded after the default change get email=True for all 4 types."""
    user = User.objects.create_user(
        email="new_user_seed_test@example.com",
        password="x",  # pragma: allowlist secret
        org_id=uuid.uuid4(),
    )
    seed_for_user(user)

    for t in APPROVER_TYPES:
        pref = NotificationPreference.objects.get(user=user, type=t, channel="email")
        assert pref.enabled is True, f"New user: {t} email should default to enabled"
