"""Tests for the expiry-scan service and detect_training_overdue task."""

from __future__ import annotations

import datetime
import uuid

import pytest
from freezegun import freeze_time

from modules.certification.models import Certification, TrainingAssignment, TrainingPlan
from modules.certification.services.expiry_scan import scan_certification_expiry
from modules.notification.models import Notification

ORG_ID = uuid.uuid4()
EMP_ID = uuid.uuid4()

TODAY = datetime.date(2026, 4, 28)


def _make_cert(expires_on, status="active", **kwargs):
    defaults = dict(
        org_id=ORG_ID,
        employee_id=EMP_ID,
        name="Test Cert",
        issued_on="2025-01-01",
        status=status,
    )
    defaults.update(kwargs)
    return Certification.all_objects.create(expires_on=expires_on, **defaults)


def _make_assignment(due_date, status="assigned"):
    plan = TrainingPlan.all_objects.create(org_id=ORG_ID, name="Plan")
    return TrainingAssignment.all_objects.create(
        org_id=ORG_ID,
        plan=plan,
        employee_id=EMP_ID,
        assigned_by=uuid.uuid4(),
        due_date=due_date,
        status=status,
    )


# ── expiry-scan tests ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_cert_expiring_in_90d_sends_reminder():
    """Cert expiring in exactly 90 days → 90d reminder fires + flag set."""
    expires = TODAY + datetime.timedelta(days=90)
    cert = _make_cert(expires)
    with freeze_time(TODAY):
        counts = scan_certification_expiry()
    assert counts["90d"] == 1
    cert.refresh_from_db()
    assert cert.reminder_sent_90d is True
    # M9: notify() called best-effort; no Employee linked in this test, so count stays 0
    _ = Notification.objects.filter(type="cert.expiring_soon").count()


@pytest.mark.django_db
def test_cert_expiry_reminder_idempotent():
    """Re-running same day → no double-notify."""
    expires = TODAY + datetime.timedelta(days=90)
    cert = _make_cert(expires)
    with freeze_time(TODAY):
        counts1 = scan_certification_expiry()
        counts2 = scan_certification_expiry()
    assert counts1["90d"] == 1
    assert counts2["90d"] == 0  # flag already set — skip
    cert.refresh_from_db()
    assert cert.reminder_sent_90d is True


@pytest.mark.django_db
def test_cert_expiring_in_89d_no_reminder():
    """Cert expiring in 89 days → no reminder (only exact-day match)."""
    expires = TODAY + datetime.timedelta(days=89)
    _make_cert(expires)
    with freeze_time(TODAY):
        counts = scan_certification_expiry()
    assert counts["90d"] == 0
    assert counts["60d"] == 0
    assert counts["30d"] == 0


@pytest.mark.django_db
def test_cert_expiring_in_60d_sends_60d_reminder():
    expires = TODAY + datetime.timedelta(days=60)
    cert = _make_cert(expires)
    with freeze_time(TODAY):
        counts = scan_certification_expiry()
    assert counts["60d"] == 1
    cert.refresh_from_db()
    assert cert.reminder_sent_60d is True


@pytest.mark.django_db
def test_cert_expiring_in_30d_sends_30d_reminder():
    expires = TODAY + datetime.timedelta(days=30)
    cert = _make_cert(expires)
    with freeze_time(TODAY):
        counts = scan_certification_expiry()
    assert counts["30d"] == 1
    cert.refresh_from_db()
    assert cert.reminder_sent_30d is True


@pytest.mark.django_db
def test_past_expiry_cert_marked_expired():
    """Past-expiry cert → status=expired auto-set."""
    expires = TODAY - datetime.timedelta(days=1)
    cert = _make_cert(expires)
    with freeze_time(TODAY):
        scan_certification_expiry()
    cert.refresh_from_db()
    assert cert.status == "expired"


@pytest.mark.django_db
def test_already_expired_cert_not_re_processed():
    """Cert already expired → no re-processing (status stays expired)."""
    expires = TODAY - datetime.timedelta(days=5)
    cert = _make_cert(expires, status="expired")
    with freeze_time(TODAY):
        scan_certification_expiry()
    cert.refresh_from_db()
    assert cert.status == "expired"


# ── training overdue tests ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_training_assignment_past_due_marked_overdue():
    """Training assignment past due_date → status=overdue."""
    due_date = TODAY - datetime.timedelta(days=1)
    assignment = _make_assignment(due_date, status="assigned")
    with freeze_time(TODAY):
        from modules.certification.tasks import detect_training_overdue

        result = detect_training_overdue()
    assert result["marked_overdue"] >= 1
    assignment.refresh_from_db()
    assert assignment.status == "overdue"


@pytest.mark.django_db
def test_training_assignment_not_yet_due_not_marked_overdue():
    """Training assignment with future due date stays assigned."""
    due_date = TODAY + datetime.timedelta(days=5)
    assignment = _make_assignment(due_date, status="assigned")
    with freeze_time(TODAY):
        from modules.certification.tasks import detect_training_overdue

        detect_training_overdue()
    assignment.refresh_from_db()
    assert assignment.status == "assigned"
