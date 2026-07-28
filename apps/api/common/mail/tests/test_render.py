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
