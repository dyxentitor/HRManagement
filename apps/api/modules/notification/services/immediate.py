"""Email rendering helpers for the notification module.

``render_security_email`` and ``render_notification_email`` produce (subject,
text) / (subject, text, html) tuples consumed by ``services/send.py`` and the
async ``send_notification_email`` Celery task.

The old synchronous ``send_immediate`` function has been retired in favour of
enqueuing ``send_notification_email.delay()`` in ``notify()`` for both
security types and urgent/high-priority notifications.
"""

from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from ..labels import label_for
from ..models import Notification
from .preferences import SECURITY_TYPES


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


def _abs_link(deep_link: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}{deep_link}" if deep_link else base


def render_notification_email(n: Notification) -> tuple[str, str, str]:
    """(subject, text_body, html_body). Security types keep their dedicated copy."""
    if n.type in SECURITY_TYPES:
        subject, text = render_security_email(n)
        html = "<p>" + text.replace("\n", "<br>") + "</p>"
        return subject, text, html
    label = label_for(n.type)
    link = _abs_link(n.deep_link)
    subject = f"[HRMS] {label}"
    text = f"{label}.\n\nOpen in HRMS: {link}"
    html = f'<p>{label}.</p><p><a href="{link}">Open in HRMS</a></p>'
    return subject, text, html
