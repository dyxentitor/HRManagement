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
