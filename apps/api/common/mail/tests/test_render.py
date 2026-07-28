"""Tests for common.mail.render — filesystem-default + override rendering (Tasks 5, 10)."""

import uuid

import pytest

from common.mail.render import render_email


@pytest.mark.django_db
def test_render_digest_default_non_empty():
    ctx = {
        "count": 2,
        "groups": [
            {
                "heading": "Leave",
                "items": [{"label": "Leave approved", "link": "https://x/leave/me"}],
            }
        ],
    }
    subject, text, html = render_email("digest", ctx)
    assert subject and "2" in subject
    assert "Leave approved" in text
    assert "Leave approved" in html and "<" in html


@pytest.mark.django_db
def test_render_password_reset():
    reset_url = "https://hrms.example.com/reset/abc123"
    subject, text, html = render_email("password_reset", {"reset_url": reset_url})
    assert subject and "Password reset" in subject
    assert text.strip()
    assert reset_url in text
    assert html.strip()
    assert reset_url in html
    assert "<" in html


@pytest.mark.django_db
def test_render_bank_changed():
    ctx = {
        "name": "Jane Doe",
        "employee_code": "E-1024",
        "bank_name": "Maybank",
        "last4": "5678",
        "email": "jane@provintell.com",
        "timestamp": "28 Jul 2026, 14:03",
    }
    subject, text, html = render_email("bank_changed", ctx)
    assert subject and "Bank info" in subject
    assert text.strip()
    assert "Jane Doe" in text
    assert "E-1024" in text
    assert "5678" in text
    assert html.strip()
    assert "Jane Doe" in html
    assert "E-1024" in html
    assert "5678" in html
    assert "<" in html


@pytest.mark.django_db
def test_render_invite():
    ctx = {
        "org": "Provintell",
        "link": "https://hrms.example.com/activate/xyz789",
        "hours": 72,
    }
    subject, text, html = render_email("invite", ctx)
    assert subject and "Provintell" in subject
    assert text.strip()
    assert ctx["link"] in text
    assert "Provintell" in text
    assert html.strip()
    assert ctx["link"] in html
    assert "Provintell" in html
    assert "<" in html


# ── Task 10: override resolution + safe fallback ─────────────────────────────


def _make_org():
    from modules.organization.models import Organization

    slug = f"mail-test-{uuid.uuid4().hex[:8]}"
    return Organization.objects.create(
        name="Mail Test Org",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_override_beats_default():
    """An EmailTemplate row for the org/key must override the filesystem default."""
    from common.mail.models import EmailTemplate

    org = _make_org()
    EmailTemplate.objects.create(
        org_id=org.id,
        key="password_reset",
        subject="Custom {{ reset_url }}",
        text_body="Reset: {{ reset_url }}",
        html_body="<b>Reset:</b> {{ reset_url }}",
    )
    subject, text, html = render_email(
        "password_reset", {"reset_url": "https://x/r"}, org_id=org.id
    )
    assert "Custom" in subject and "https://x/r" in text and "https://x/r" in html


@pytest.mark.django_db
def test_bad_override_falls_back_to_default(caplog):
    """A broken override (empty subject+text) must fall back to filesystem default silently."""
    import logging

    from common.mail.models import EmailTemplate

    org = _make_org()
    # subject is blank → override yields no usable result → fallback
    EmailTemplate.objects.create(
        org_id=org.id,
        key="password_reset",
        subject="",
        text_body="{% invalid %}",
        html_body="",
    )
    with caplog.at_level(logging.WARNING, logger="common.mail.render"):
        subject, text, html = render_email(
            "password_reset", {"reset_url": "https://x/r"}, org_id=org.id
        )
    assert text  # non-empty default
    assert subject  # filesystem subject applied


@pytest.mark.django_db
def test_override_render_exception_falls_back_to_default():
    """If render_tokens raises during override rendering, render_email must catch it
    and return the filesystem default without propagating the exception."""
    from unittest.mock import patch

    from common.mail.models import EmailTemplate

    org = _make_org()
    EmailTemplate.objects.create(
        org_id=org.id,
        key="password_reset",
        subject="Custom reset",
        text_body="Reset: {{ reset_url }}",
        html_body="<b>Reset:</b> {{ reset_url }}",
    )
    # Patch render_tokens as imported inside render.py.
    # Raise on the first call (override rendering inside the try block) but
    # delegate subsequent calls (the fallback subject at line 55) to the real function.
    from common.mail import tokens as _tokens_mod

    _real = _tokens_mod.render_tokens
    _calls = {"n": 0}

    def _side_effect(*args, **kwargs):
        _calls["n"] += 1
        if _calls["n"] == 1:
            raise RuntimeError("boom")
        return _real(*args, **kwargs)

    with patch("common.mail.render.render_tokens", side_effect=_side_effect):
        subject, text, html = render_email(
            "password_reset", {"reset_url": "https://x/r"}, org_id=org.id
        )
    # Must not raise; must return the non-empty filesystem default.
    assert subject
    assert text.strip()


@pytest.mark.django_db
def test_override_html_escapes_token_values():
    """Token values injected into the HTML override body must be HTML-escaped
    (escape=True path in render_tokens) to prevent XSS from user-supplied data."""
    from common.mail.models import EmailTemplate

    org = _make_org()
    EmailTemplate.objects.create(
        org_id=org.id,
        key="password_reset",
        subject="Reset",
        text_body="Reset: {{ reset_url }}",
        html_body="<b>{{ reset_url }}</b>",
    )
    xss_payload = "<script>alert(1)</script>"
    subject, text, html = render_email(
        "password_reset", {"reset_url": xss_payload}, org_id=org.id
    )
    # The raw script tag must NOT appear unescaped in the HTML output.
    assert "<script>" not in html, (
        "XSS BLOCKER: render_email did not escape token values in html_body — "
        "raw <script> tag found in returned html."
    )
    # The escaped form must be present.
    assert "&lt;script&gt;" in html


# ── Task 2: notification_card template ───────────────────────────────────────


@pytest.mark.django_db
def test_notification_card_renders_greeting_rows_cta():
    ctx = {
        "greeting_name": "Jane",
        "headline": "Your leave request has been approved ✅",
        "rows": [{"label": "Type", "value": "Annual Leave"}, {"label": "Days", "value": "3"}],
        "cta_label": "View request",
        "cta_url": "https://x/leave/me",
        "whats_next": "A calendar hold will be added.",
    }
    subject, text, html = render_email("notification_card", ctx)
    for probe in ("Jane", "approved", "Annual Leave", "View request", "https://x/leave/me", "calendar hold"):
        assert probe in text, f"probe {probe!r} missing from text"
        assert probe in html, f"probe {probe!r} missing from html"


# ── Task 16: branding shell is live + notification org_id threads through ─────


@pytest.mark.django_db
def test_branding_accent_appears_in_rendered_html():
    """EmailConfiguration accent_color must reach the rendered html via base.html."""
    from common.mail.models import EmailConfiguration

    org = _make_org()
    EmailConfiguration.objects.create(org_id=org.id, accent_color="#123456")
    ctx = {
        "count": 1,
        "groups": [
            {
                "heading": "Leave",
                "items": [{"label": "Leave approved", "link": "https://x/leave/me"}],
            }
        ],
    }
    _, _, html = render_email("digest", ctx, org_id=org.id)
    assert "#123456" in html, "accent_color must appear in rendered html (base.html not wired)"
    assert "Leave approved" in html, "digest body content must still be present after wrapping"
    assert "You have" in html, "digest body opening text must still be present after wrapping"


@pytest.mark.django_db
def test_notification_render_applies_org_override():
    """render_notification_email must pass org_id so EmailTemplate overrides are applied.

    Updated in Task 2: render_notification_email now uses key="notification_card"
    (card-enriched template) instead of the old bare "notification" key. The
    EmailTemplate override must be registered under the new key to be applied.
    """
    import uuid

    from common.mail.models import EmailTemplate

    from modules.identity.models import User
    from modules.notification.models import Notification
    from modules.notification.services.immediate import render_notification_email

    org_id = uuid.uuid4()
    EmailTemplate.objects.create(
        org_id=org_id,
        key="notification_card",
        subject="Custom notification_card subject",
        text_body="Custom text body for org",
        html_body="<p>Custom HTML override for org</p>",
    )
    # Create a user and a notification row with the matching org_id
    user = User.objects.create_user(  # pragma: allowlist secret
        email=f"notif-test-{uuid.uuid4().hex[:6]}@x.com",
        password="x",
        org_id=org_id,
    )
    n = Notification.objects.create(
        org_id=org_id,
        user=user,
        type="leave.approved",
        channel="email",
        payload={},
        deep_link="/leave/me",
        priority="normal",
    )
    subject, text, html = render_notification_email(n)
    assert "Custom notification_card subject" in subject, (
        "Per-org EmailTemplate override subject must be used when org_id is threaded through"
    )
    assert "Custom HTML override for org" in html, (
        "Per-org EmailTemplate override html_body must appear in rendered html"
    )
