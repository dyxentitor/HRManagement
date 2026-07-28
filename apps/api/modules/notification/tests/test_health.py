"""Tests for modules.notification.services.health (EH6: hourly SMTP health-check)."""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone

from common.mail.models import EmailConfiguration
from modules.identity.models import Role, User, UserRole
from modules.notification.models import Notification

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org_id():
    return uuid.uuid4()


@pytest.fixture
def org_with_admin_and_config(org_id):
    """Returns (org_id, admin_user, email_config) — config starts healthy (no failures)."""
    admin = User.objects.create_user(
        email="admin@healthtest.com",
        password="x",  # pragma: allowlist secret
        org_id=org_id,
    )
    role = Role.objects.create(org_id=org_id, code="org_admin", name="Admin", is_system=True)
    UserRole.objects.create(user=admin, role=role, granted_by=None)
    cfg = EmailConfiguration.objects.create(
        org_id=org_id,
        smtp_host="smtp.example.com",
        enabled=True,
        # No last_failure_at → was_healthy returns True
    )
    return org_id, admin, cfg


@pytest.fixture
def org_config_already_failing(org_id):
    """Returns (org_id, admin_user, email_config) — config is already in a failing state."""
    admin = User.objects.create_user(
        email="admin2@healthtest.com",
        password="x",  # pragma: allowlist secret
        org_id=org_id,
    )
    role = Role.objects.create(org_id=org_id, code="org_admin", name="Admin2", is_system=True)
    UserRole.objects.create(user=admin, role=role, granted_by=None)
    now = timezone.now()
    cfg = EmailConfiguration.objects.create(
        org_id=org_id,
        smtp_host="smtp.example.com",
        enabled=True,
        last_success_at=now,
        # last_failure_at is newer than last_success_at → already failing
        last_failure_at=timezone.now(),
        last_failure_message="prev failure",
    )
    # Ensure last_failure_at > last_success_at (they might be equal on fast machines)
    EmailConfiguration.objects.filter(pk=cfg.pk).update(last_failure_at=timezone.now())
    cfg.refresh_from_db()
    return org_id, admin, cfg


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_health_alerts_org_admins_on_transition_to_failing(monkeypatch, org_with_admin_and_config):
    import modules.notification.services.health as h

    monkeypatch.setattr(
        h, "run_connection_test", lambda org_id, o: {"success": False, "detail": "conn refused"}
    )
    res = h.check_email_health()
    assert res["alerted"] >= 1
    # admin got the in-app alert
    assert Notification.objects.filter(
        type="system.email_delivery_failed", channel="in_app"
    ).exists()


@pytest.mark.django_db
def test_health_no_alert_when_already_failing(monkeypatch, org_config_already_failing):
    import modules.notification.services.health as h

    monkeypatch.setattr(
        h, "run_connection_test", lambda org_id, o: {"success": False, "detail": "still down"}
    )
    res = h.check_email_health()
    assert res["alerted"] == 0  # not re-spammed while already down


@pytest.mark.django_db
def test_health_no_alert_when_healthy(monkeypatch, org_with_admin_and_config):
    import modules.notification.services.health as h

    monkeypatch.setattr(
        h, "run_connection_test", lambda org_id, o: {"success": True, "detail": "ok"}
    )
    assert h.check_email_health()["alerted"] == 0


@pytest.mark.django_db
def test_health_counts_checked_and_failed(monkeypatch, org_with_admin_and_config):
    """Sanity check on the returned counters."""
    import modules.notification.services.health as h

    monkeypatch.setattr(
        h, "run_connection_test", lambda org_id, o: {"success": False, "detail": "err"}
    )
    res = h.check_email_health()
    assert res["checked"] == 1
    assert res["failed"] == 1
    assert res["alerted"] == 1


@pytest.mark.django_db
def test_health_empty_when_no_configs(monkeypatch):
    """No EmailConfiguration rows → no checks, no alerts."""
    import modules.notification.services.health as h

    called = []

    def _noop(org_id, o):
        called.append(1)
        return {"success": True}

    monkeypatch.setattr(h, "run_connection_test", _noop)
    res = h.check_email_health()
    assert res == {"checked": 0, "failed": 0, "alerted": 0}
    assert called == []
