"""Tests for common.mail.render — filesystem-default rendering (Task 5)."""

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
