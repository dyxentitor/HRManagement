import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core import mail

from modules.identity.models import User
from modules.notification.models import Notification
from modules.notification.services.notify import notify

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        key = Fernet.generate_key().decode()  # pragma: allowlist secret
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", key)


@pytest.fixture
def user():
    return User.objects.create_user(  # pragma: allowlist secret
        email="u@x.com", password="x", org_id=uuid.uuid4()
    )


def test_security_notify_sends_immediately(user):
    mail.outbox.clear()
    notify(
        user=user,
        type="auth.password_changed",
        payload={"method": "self"},
        deep_link="/me/profile",
        priority="high",
    )
    # one immediate email, subject is per-type (not the generic digest subject)
    assert len(mail.outbox) == 1
    assert "password" in mail.outbox[0].subject.lower()
    # the email-channel row is marked sent (digest will skip it)
    email_row = Notification.objects.get(user=user, type="auth.password_changed", channel="email")
    assert email_row.delivery_status == "sent"


def test_non_security_notify_does_not_send_immediately(user):
    mail.outbox.clear()
    notify(user=user, type="leave.approved", payload={}, priority="normal")
    assert len(mail.outbox) == 0  # goes to the hourly digest, not immediate
    row = Notification.objects.get(user=user, type="leave.approved", channel="email")
    assert row.delivery_status == "pending"


def test_immediate_bypasses_org_kill_switch(user):
    from common.mail.models import EmailConfiguration

    EmailConfiguration.objects.create(org_id=user.org_id, enabled=False)
    mail.outbox.clear()
    notify(user=user, type="auth.mfa_disabled", payload={}, priority="high")
    assert len(mail.outbox) == 1  # transactional category ignores enabled=False


def test_immediate_send_failure_leaves_pending_and_does_not_raise(user, monkeypatch):
    import modules.notification.services.immediate as imm

    def boom(**kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(imm, "mail_send", boom)
    # must not raise
    notify(user=user, type="auth.password_changed", payload={"method": "self"}, priority="high")
    row = Notification.objects.get(user=user, type="auth.password_changed", channel="email")
    assert row.delivery_status == "pending"
