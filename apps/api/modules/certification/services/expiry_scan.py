"""Daily scan: certifications nearing expiry → notify; idempotent on flags."""

from __future__ import annotations

import datetime

from django.utils import timezone

from common.audit import append
from modules.certification.models import Certification


def scan_certification_expiry(*, org_id=None) -> dict[str, int]:
    """Find certs in {90, 60, 30} day windows that haven't been notified yet.

    Returns counts by window. Sets the corresponding `reminder_sent_*` flag
    so re-runs the next day don't re-send. Notifications are best-effort —
    the flag is set even if email send fails (avoids retry storms).
    """
    today = timezone.localdate()
    counts = {"30d": 0, "60d": 0, "90d": 0}
    qs = Certification.all_objects.filter(deleted_at__isnull=True, status="active")
    if org_id is not None:
        qs = qs.filter(org_id=org_id)

    for window_days, flag_name in [
        (90, "reminder_sent_90d"),
        (60, "reminder_sent_60d"),
        (30, "reminder_sent_30d"),
    ]:
        threshold = today + datetime.timedelta(days=window_days)
        candidates = qs.filter(
            expires_on=threshold,
            **{flag_name: False},
        )
        for cert in candidates:
            _notify(cert, days_remaining=window_days)
            setattr(cert, flag_name, True)
            cert.save(update_fields=[flag_name, "updated_at"])
            append(
                org_id=cert.org_id,
                action="certification.expiry_reminder",
                entity="certifications",
                entity_id=cert.id,
                before=None,
                after={"days_remaining": window_days},
            )
            counts[f"{window_days}d"] += 1

    # Mark expired certs
    expired = qs.filter(expires_on__lt=today, status="active")
    for cert in expired:
        cert.status = "expired"
        cert.save(update_fields=["status", "updated_at"])

    return counts


def _notify(cert, days_remaining: int) -> None:
    """Send in-app + email reminder via notify(). Best-effort."""
    import logging

    logger = logging.getLogger(__name__)
    try:
        from modules.employee.models import Employee
        from modules.notification.services.notify import notify

        emp = Employee.all_objects.filter(id=cert.employee_id).first()
        if emp is None:
            return
        emp_user = getattr(emp, "user", None)
        if emp_user is None:
            return
        notify(
            user=emp_user,
            type="cert.expiring_soon",
            payload={
                "cert_id": str(cert.id),
                "cert_name": cert.name,
                "expires_on": str(cert.expires_on),
                "days_remaining": days_remaining,
            },
            deep_link="/certifications/me",
        )
    except Exception:
        logger.exception("Failed to send expiry reminder for cert %s", cert.id)
