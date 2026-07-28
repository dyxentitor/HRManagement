"""Tests for render_notification_email, render_and_send, and send_notification_email task."""

from __future__ import annotations

import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core import mail

from modules.identity.models import User
from modules.notification.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        key = Fernet.generate_key().decode()  # pragma: allowlist secret
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", key)


@pytest.fixture
def user():
    return User.objects.create_user(  # pragma: allowlist secret
        email="send_task@x.com", password="x", org_id=uuid.uuid4()
    )


def _make_pending_email(user, notif_type="assignment.overdue", deep_link="/action-center"):
    return Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type=notif_type,
        channel="email",
        deep_link=deep_link,
        delivery_status="pending",
    )


# ---------------------------------------------------------------------------
# render_notification_email
# ---------------------------------------------------------------------------


def test_render_notification_email_non_security_has_label_and_link(user):
    from modules.notification.services.immediate import render_notification_email

    n = _make_pending_email(user, notif_type="assignment.overdue", deep_link="/action-center")
    subject, text, html = render_notification_email(n)
    assert "Assignment overdue" in subject
    assert "/action-center" in text
    assert "<a href=" in html


def test_render_notification_email_non_security_html_contains_link_tag(user):
    from modules.notification.services.immediate import render_notification_email

    n = _make_pending_email(user, notif_type="leave.approved", deep_link="/leave")
    subject, _text, html = render_notification_email(n)
    assert "[HRMS]" in subject
    assert "Leave request approved" in subject
    assert "<a href=" in html
    assert "/leave" in html


def test_render_notification_email_security_uses_security_copy(user):
    from modules.notification.services.immediate import render_notification_email

    n = _make_pending_email(user, notif_type="auth.password_changed")
    n.payload = {"method": "self"}
    n.save(update_fields=["payload"])
    subject, _text, html = render_notification_email(n)
    assert "password" in subject.lower()
    # html is a wrapping of the text body
    assert "<p>" in html


# ---------------------------------------------------------------------------
# render_and_send
# ---------------------------------------------------------------------------


def test_render_and_send_no_email_skips(user):
    from modules.notification.services.send import render_and_send

    user.email = ""
    user.save(update_fields=["email"])
    n = _make_pending_email(user)
    result = render_and_send(n)
    assert result == "skipped"
    assert len(mail.outbox) == 0


def test_render_and_send_non_security_respects_killswitch(user):
    from common.mail.models import EmailConfiguration
    from modules.notification.services.send import render_and_send

    EmailConfiguration.objects.create(org_id=user.org_id, enabled=False)
    mail.outbox.clear()
    n = _make_pending_email(user, notif_type="leave.approved")
    result = render_and_send(n)
    assert result == "skipped"
    assert len(mail.outbox) == 0


def test_render_and_send_security_bypasses_killswitch(user):
    from common.mail.models import EmailConfiguration
    from modules.notification.services.send import render_and_send

    EmailConfiguration.objects.create(org_id=user.org_id, enabled=False)
    mail.outbox.clear()
    n = _make_pending_email(user, notif_type="auth.mfa_disabled")
    result = render_and_send(n)
    assert result == "sent"
    assert len(mail.outbox) == 1


# ---------------------------------------------------------------------------
# send_notification_email Celery task
# ---------------------------------------------------------------------------


def test_task_marks_sent_on_success(user):
    from modules.notification.tasks import send_notification_email

    mail.outbox.clear()
    n = _make_pending_email(user, notif_type="payslip.published", deep_link="/payslips")
    result = send_notification_email(n.id)
    assert result == "sent"
    n.refresh_from_db()
    assert n.delivery_status == "sent"
    assert n.sent_at is not None
    assert len(mail.outbox) == 1


def test_task_returns_noop_for_missing_notification(user):
    from modules.notification.tasks import send_notification_email

    result = send_notification_email(999999999)
    assert result == "noop"


def test_task_returns_noop_for_non_pending_notification(user):
    from modules.notification.tasks import send_notification_email

    n = Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="sent",
    )
    result = send_notification_email(n.id)
    assert result == "noop"


def test_task_marks_failed_after_max_retries(user, monkeypatch):
    """With render_and_send always raising, the task marks the row failed.

    When the task is called directly (not via .delay()/.apply_async()), Celery's
    retry machinery detects `request.called_directly=True` and immediately re-raises
    the original exception rather than scheduling a retry. We cannot exercise the
    full retry→MaxRetriesExceededError chain in this mode, so we test the failure
    path directly: monkeypatch the task's `retry` method to immediately raise
    MaxRetriesExceededError, simulating exhausted retries, and assert the row ends
    in the `failed` state.
    """
    from celery.exceptions import MaxRetriesExceededError

    import modules.notification.services.send as send_mod
    from modules.notification.tasks import send_notification_email

    def boom(n):
        raise RuntimeError("smtp exploded")

    def fake_retry(exc=None, **kwargs):
        raise MaxRetriesExceededError("max retries exceeded")

    monkeypatch.setattr(send_mod, "render_and_send", boom)

    n = _make_pending_email(user, notif_type="leave.approved")

    # Bind the task instance and patch retry on it so MaxRetriesExceededError
    # is raised immediately, simulating the post-exhaustion state.
    task_instance = send_notification_email._get_current_object()
    monkeypatch.setattr(task_instance, "retry", fake_retry)
    result = task_instance.run(n.id)
    assert result == "failed"
    n.refresh_from_db()
    assert n.delivery_status == "failed"
