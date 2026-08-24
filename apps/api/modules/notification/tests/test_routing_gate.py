"""Org-level kill-switch, security override, and cc_context plumbing."""

import uuid

import pytest

from modules.identity.models import User
from modules.notification.models import Notification, NotificationRouting
from modules.notification.services.notify import notify

pytestmark = pytest.mark.django_db


@pytest.fixture
def org_id():
    return uuid.uuid4()


@pytest.fixture
def user(org_id):
    return User.objects.create(org_id=org_id, email="emp@provintell.com", is_active=True)


def _channels(user, type_code):
    return set(
        Notification.objects.filter(user=user, type=type_code).values_list("channel", flat=True)
    )


def test_defaults_create_both_channels(user):
    notify(user=user, type="leave.approved")
    assert _channels(user, "leave.approved") == {"in_app", "email"}


def test_org_email_kill_switch_suppresses_email_only(user, org_id):
    NotificationRouting.objects.create(org_id=org_id, type="leave.approved", email_enabled=False)
    notify(user=user, type="leave.approved")
    assert _channels(user, "leave.approved") == {"in_app"}


def test_org_in_app_kill_switch_suppresses_in_app_only(user, org_id):
    NotificationRouting.objects.create(org_id=org_id, type="leave.approved", in_app_enabled=False)
    notify(user=user, type="leave.approved")
    assert _channels(user, "leave.approved") == {"email"}


def test_both_kill_switches_off_creates_nothing(user, org_id):
    NotificationRouting.objects.create(
        org_id=org_id, type="leave.approved", in_app_enabled=False, email_enabled=False
    )
    assert notify(user=user, type="leave.approved") == []


def test_security_type_email_cannot_be_killed_even_by_a_hostile_row(user, org_id):
    # Written directly to the DB, bypassing serializer validation.
    NotificationRouting.objects.create(
        org_id=org_id, type="auth.password_changed", email_enabled=False
    )
    notify(user=user, type="auth.password_changed")
    assert "email" in _channels(user, "auth.password_changed")


def test_security_type_in_app_cannot_be_killed_even_by_a_hostile_row(user, org_id):
    # Same hostile-row shape as the email case: an admin (or a stray script)
    # must not be able to silence a security notice on the in-app channel.
    NotificationRouting.objects.create(
        org_id=org_id, type="auth.password_changed", in_app_enabled=False
    )
    notify(user=user, type="auth.password_changed")
    assert "in_app" in _channels(user, "auth.password_changed")


def test_security_type_survives_both_kill_switches_off(user, org_id):
    NotificationRouting.objects.create(
        org_id=org_id,
        type="auth.password_changed",
        in_app_enabled=False,
        email_enabled=False,
    )
    notify(user=user, type="auth.password_changed")
    assert _channels(user, "auth.password_changed") == {"in_app", "email"}


def test_cc_context_is_persisted_on_the_row(user):
    approver_id = str(uuid.uuid4())
    notify(user=user, type="leave.approved", cc_context={"approver": approver_id})
    n = Notification.objects.filter(user=user, type="leave.approved", channel="email").first()
    assert n.cc_context == {"approver": approver_id}


def test_cc_context_defaults_to_empty_dict(user):
    notify(user=user, type="leave.approved")
    n = Notification.objects.filter(user=user, type="leave.approved", channel="email").first()
    assert n.cc_context == {}


def test_org_gate_does_not_override_a_user_opt_out(user, org_id):
    """Org ON means the personal preference still decides."""
    from modules.notification.models import NotificationPreference

    NotificationPreference.objects.update_or_create(
        user=user, type="leave.approved", channel="email", defaults={"enabled": False}
    )
    NotificationRouting.objects.create(org_id=org_id, type="leave.approved", email_enabled=True)
    notify(user=user, type="leave.approved")
    assert _channels(user, "leave.approved") == {"in_app"}
