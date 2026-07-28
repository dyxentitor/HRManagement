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


@pytest.fixture(autouse=True)
def _celery_eager(settings):
    """Force Celery EAGER mode so .delay() runs inline, enabling outbox assertions.

    The container's DJANGO_SETTINGS_MODULE defaults to dev (no ALWAYS_EAGER),
    so we override it here to ensure task execution is synchronous in tests.
    EAGER_PROPAGATES stays False so the task's own exception handler can
    catch MaxRetriesExceededError — notify()'s try/except is the outer guard.
    """
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    # Re-apply to the live celery app config (pytest-django settings fixture
    # patches Django settings but Celery reads its own conf cache)
    from hrms_api.celery import app as celery_app

    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    yield
    celery_app.conf.task_always_eager = False
    celery_app.conf.task_eager_propagates = False


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


def test_urgent_non_security_notify_sends_immediately(user):
    """urgent/high priority non-security types also enqueue for immediate send."""
    mail.outbox.clear()
    notify(user=user, type="leave.approved", payload={}, priority="urgent")
    assert len(mail.outbox) == 1
    row = Notification.objects.get(user=user, type="leave.approved", channel="email")
    assert row.delivery_status == "sent"


def test_high_non_security_notify_sends_immediately(user):
    """high priority non-security types also enqueue for immediate send."""
    mail.outbox.clear()
    notify(user=user, type="leave.approved", payload={}, priority="high")
    assert len(mail.outbox) == 1
    row = Notification.objects.get(user=user, type="leave.approved", channel="email")
    assert row.delivery_status == "sent"


def test_immediate_bypasses_org_kill_switch(user):
    from common.mail.models import EmailConfiguration

    EmailConfiguration.objects.create(org_id=user.org_id, enabled=False)
    mail.outbox.clear()
    notify(user=user, type="auth.mfa_disabled", payload={}, priority="high")
    assert len(mail.outbox) == 1  # transactional category ignores enabled=False


def test_immediate_send_failure_does_not_raise(user, monkeypatch):
    """A send failure must never propagate out of notify().

    With CELERY_TASK_EAGER_PROPAGATES=True the task exception surfaces through
    .delay() before the task's own retry/MaxRetriesExceeded handler can set
    'failed'. notify() wraps .delay() in a best-effort try/except so the row
    is left 'pending' (fallback to digest) and the caller is never interrupted.
    """
    import modules.notification.services.send as svc_send

    def boom(n):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(svc_send, "render_and_send", boom)
    # must not raise — notify() swallows the propagated task exception
    notify(user=user, type="auth.password_changed", payload={"method": "self"}, priority="high")
    row = Notification.objects.get(user=user, type="auth.password_changed", channel="email")
    # Row is left pending (digest is the fallback); task exception was swallowed
    assert row.delivery_status == "pending"
