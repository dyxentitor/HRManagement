"""Tests for feedback notification type registration."""

from modules.notification.services.preferences import default_for


def test_feedback_received_type_in_app_only():
    """feedback.received is in-app only (email default=False)."""
    assert default_for("feedback.received", "in_app") is True
    assert default_for("feedback.received", "email") is False
