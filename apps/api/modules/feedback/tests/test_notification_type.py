"""Tests for feedback notification type registration."""

from modules.notification.services.preferences import default_for


def test_feedback_type_in_app_only():
    assert default_for("feedback.status_changed", "in_app") is True
    assert default_for("feedback.status_changed", "email") is False
