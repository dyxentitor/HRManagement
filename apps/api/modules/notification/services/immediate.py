"""Email rendering helpers for the notification module.

``render_notification_email`` produces a (subject, text, html) tuple consumed
by ``services/send.py`` and the async ``send_notification_email`` Celery task.

Security notifications delegate to the ``security`` email template (via
``render_email``); all others use the ``notification`` template.
"""

from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from ..labels import label_for
from ..models import Notification
from .preferences import SECURITY_TYPES

_WARN = "If this wasn't you, contact your administrator immediately."


def _ts(n: Notification) -> str:
    return timezone.localtime(n.created_at).strftime("%d %b %Y, %H:%M")


def _security_copy(n: Notification) -> tuple[str, str, str]:
    """(subject, message, warn) for a security notification. English; i18n deferred (Phase 3)."""
    p = n.payload or {}
    ts = _ts(n)
    if n.type == "auth.password_changed":
        method = {"reset": "via a reset link", "self": "from your account"}.get(p.get("method"), "")
        return (
            "[HRMS] Your password was changed",
            f"Your HRMS password was changed {method} on {ts}.",
            _WARN,
        )
    if n.type == "auth.mfa_enabled":
        return (
            "[HRMS] Two-factor authentication enabled",
            f"Two-factor authentication was enabled on your HRMS account on {ts}.",
            "",
        )
    if n.type == "auth.mfa_disabled":
        return (
            "[HRMS] Two-factor authentication disabled",
            f"Two-factor authentication was turned off on your HRMS account on {ts}.",
            _WARN,
        )
    if n.type == "user.role_changed":
        added = ", ".join(p.get("added", []) or []) or "none"
        removed = ", ".join(p.get("removed", []) or []) or "none"
        message = f"Your HRMS roles were updated on {ts}.\nAdded: {added}\nRemoved: {removed}"
        return ("[HRMS] Your account roles were changed", message, _WARN)
    if n.type == "employee.bank_changed_self":
        return (
            "[HRMS] Bank details changed",
            (
                f"An employee's bank details were changed via self-service on {ts}. "
                f"Details: {p.get('name', '')} ({p.get('employee_code', '')})."
            ),
            "",
        )
    # Fallback for any future immediate type
    return (
        f"[HRMS] Security alert: {n.type}",
        f"A security-relevant change occurred on {ts}.\n{p}",
        "",
    )


def _abs_link(deep_link: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}{deep_link}" if deep_link else base


def render_notification_email(n: Notification) -> tuple[str, str, str]:
    """(subject, text_body, html_body). Security types use the security template."""
    from common.mail.render import render_email

    if n.type in SECURITY_TYPES:
        subject, message, warn = _security_copy(n)
        return render_email("security", {"subject": subject, "message": message, "warn": warn}, org_id=n.org_id)
    label = label_for(n.type)
    return render_email("notification", {"label": label, "link": _abs_link(n.deep_link)}, org_id=n.org_id)
