"""Immediate email delivery for security-relevant notifications.

Security alerts (password/MFA/role/bank changes) must reach the user now, not
after the hourly digest. They send with category="transactional" so they bypass
the org email kill-switch, and are best-effort: a send failure leaves the email
row `pending` so the digest is the fallback, and never raises into the caller.
"""

from __future__ import annotations

import logging

from django.utils import timezone

from common.mail import send as mail_send

from ..models import Notification
from .preferences import SECURITY_TYPES

logger = logging.getLogger(__name__)

IMMEDIATE_TYPES = SECURITY_TYPES


def _ts(n: Notification) -> str:
    return timezone.localtime(n.created_at).strftime("%d %b %Y, %H:%M")


def render_security_email(n: Notification) -> tuple[str, str]:
    """(subject, body) for a security notification. English; i18n deferred (Phase 3)."""
    p = n.payload or {}
    ts = _ts(n)
    warn = "If this wasn't you, contact your administrator immediately."
    if n.type == "auth.password_changed":
        method = {"reset": "via a reset link", "self": "from your account"}.get(p.get("method"), "")
        return (
            "[HRMS] Your password was changed",
            f"Your HRMS password was changed {method} on {ts}.\n\n{warn}",
        )
    if n.type == "auth.mfa_enabled":
        return (
            "[HRMS] Two-factor authentication enabled",
            f"Two-factor authentication was enabled on your HRMS account on {ts}.",
        )
    if n.type == "auth.mfa_disabled":
        return (
            "[HRMS] Two-factor authentication disabled",
            f"Two-factor authentication was turned off on your HRMS account on {ts}.\n\n{warn}",
        )
    if n.type == "user.role_changed":
        added = ", ".join(p.get("added", []) or []) or "none"
        removed = ", ".join(p.get("removed", []) or []) or "none"
        body = (
            f"Your HRMS roles were updated on {ts}.\nAdded: {added}\nRemoved: {removed}\n\n{warn}"
        )
        return ("[HRMS] Your account roles were changed", body)
    if n.type == "employee.bank_changed_self":
        return (
            "[HRMS] Bank details changed",
            f"An employee's bank details were changed via self-service on {ts}. "
            f"Details: {p.get('name', '')} ({p.get('employee_code', '')}).",
        )
    # Fallback for any future immediate type
    fallback_body = f"A security-relevant change occurred on {ts}.\n{p}"
    return (f"[HRMS] Security alert: {n.type}", fallback_body)


def send_immediate(n: Notification) -> None:
    """Send one security email now. Best-effort: never raises; failure → leave pending."""
    if not n.user.email:
        return  # leave pending; digest will mark skipped
    subject, body = render_security_email(n)
    try:
        mail_send(
            org_id=n.org_id,
            subject=subject,
            body=body,
            to=[n.user.email],
            category="transactional",
            append_signature=True,
            fail_silently=False,
        )
    except Exception:
        logger.warning("Immediate security email failed for notification %s; left pending", n.id)
        return
    n.delivery_status = "sent"
    n.sent_at = timezone.now()
    n.save(update_fields=["delivery_status", "sent_at"])
