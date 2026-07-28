"""Email digest service tests."""

from __future__ import annotations

import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core import mail
from django.test import override_settings

from modules.identity.models import User
from modules.notification.labels import domain_label, label_for
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


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://hrms.example.com")
def test_digest_humanized_body(user):
    """Digest email body contains friendly labels, domain headings, absolute deep-links,
    and an HTML alternative is present.
    """
    # Two notifications from different domains, each with a deep_link
    Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="pending",
        payload={"msg": "test"},
        deep_link="/leave/123",
    )
    Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="claim.submitted",
        channel="email",
        delivery_status="pending",
        payload={"msg": "test"},
        deep_link="/claims/456",
    )

    result = send_digests()
    assert result["users"] == 1
    assert result["notifications"] == 2
    assert len(mail.outbox) == 1

    msg = mail.outbox[0]
    text_body = msg.body

    # Friendly labels appear in text body
    assert label_for("leave.approved") in text_body
    assert label_for("claim.submitted") in text_body

    # Domain headings appear in text body
    assert domain_label("leave.approved") in text_body
    assert domain_label("claim.submitted") in text_body

    # Absolute deep-links appear in text body
    assert "https://hrms.example.com/leave/123" in text_body
    assert "https://hrms.example.com/claims/456" in text_body

    # HTML alternative is present
    assert len(msg.alternatives) >= 1
    html_body = msg.alternatives[0][0]
    assert msg.alternatives[0][1] == "text/html"

    # HTML also contains labels and links
    assert label_for("leave.approved") in html_body
    assert label_for("claim.submitted") in html_body
    assert "https://hrms.example.com/leave/123" in html_body
    assert "https://hrms.example.com/claims/456" in html_body
    # HTML has structural elements
    assert "<h3>" in html_body
    assert "<ul>" in html_body
    assert "<li>" in html_body


# ---------------------------------------------------------------------------
# Task-7: digest items use card headline instead of bare label
# ---------------------------------------------------------------------------

@pytest.fixture
def _leave_approved_setup():
    """Create org + dept + leave type + user + employee + leave request."""
    import datetime
    from decimal import Decimal

    from modules.employee.models import Employee
    from modules.leave.models import LeaveRequest, LeaveType
    from modules.organization.models import Department, Organization

    org_id = uuid.uuid4()
    org = Organization.objects.create(
        name=f"DigestOrg-{org_id.hex[:6]}",
        slug=f"digestorg-{org_id.hex[:8]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="HR")
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    user = User.objects.create_user(
        email=f"duser-{org_id.hex[:8]}@digest.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=f"D{org_id.hex[:6]}",
        first_name="Alice",
        last_name="Wong",
        email=f"duser-{org_id.hex[:8]}@digest.test",
        department=dept,
        employment_type="fulltime",
        hire_date=datetime.date(2023, 1, 1),
    )
    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 8, 10),
        end_date=datetime.date(2026, 8, 12),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="Holiday",
        status="approved",
    )
    return org, user, lr


@pytest.mark.django_db
def test_digest_item_uses_card_headline(_leave_approved_setup):
    """Digest email body contains the enriched card headline (not the bare label)
    when build_card can hydrate from the payload.
    """
    org, user, lr = _leave_approved_setup
    Notification.objects.create(
        org_id=org.id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="pending",
        payload={"leave_request_id": str(lr.id)},
        deep_link="/leave/me",
    )

    send_digests()
    assert len(mail.outbox) == 1

    text_body = mail.outbox[0].body
    html_body = mail.outbox[0].alternatives[0][0]

    # The enriched headline from _leave_card
    expected_headline = "Your leave request has been approved"
    assert expected_headline in text_body, (
        f"Expected card headline '{expected_headline}' in text body, got: {text_body[:500]}"
    )
    assert expected_headline in html_body, (
        f"Expected card headline '{expected_headline}' in HTML body"
    )

    # The bare label should NOT appear as the item line (it would if _item_label fell back)
    bare_label = label_for("leave.approved")
    # The bare label is a different string to the headline; it should not appear in the item list.
    # (Domain headings may use domain_label which is different; we check for the specific bare label.)
    assert bare_label != expected_headline  # sanity: they differ
    # The bare label should not be in the body when the card headline is richer
    assert bare_label not in text_body, (
        f"Bare label '{bare_label}' should not appear when card headline is used"
    )


@pytest.mark.django_db
def test_digest_item_falls_back_to_label_on_build_card_failure(user, monkeypatch):
    """When build_card raises, _item_label falls back to label_for(n.type)."""
    import modules.notification.services.digest as d

    def _always_raise(n):
        raise RuntimeError("card builder exploded")

    monkeypatch.setattr(d, "build_card", _always_raise)

    Notification.objects.create(
        org_id=user.org_id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="pending",
        payload={"leave_request_id": str(uuid.uuid4())},
        deep_link="/leave/me",
    )

    send_digests()
    assert len(mail.outbox) == 1

    text_body = mail.outbox[0].body
    html_body = mail.outbox[0].alternatives[0][0]

    # Fallback to bare label
    bare_label = label_for("leave.approved")
    assert bare_label in text_body
    assert bare_label in html_body
