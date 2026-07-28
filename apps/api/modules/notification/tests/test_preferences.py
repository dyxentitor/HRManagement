"""Tests for notification preference defaults and helpers."""

from __future__ import annotations

import pytest

from modules.notification.services.preferences import default_for, is_security_type


@pytest.mark.django_db
def test_email_health_type_registered():
    assert default_for("system.email_delivery_failed", "in_app") is True
    assert default_for("system.email_delivery_failed", "email") is False
    assert is_security_type("system.email_delivery_failed") is False
