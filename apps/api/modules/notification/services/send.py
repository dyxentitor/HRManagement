"""render_and_send — render one notification email and send it via common.mail."""

from __future__ import annotations

from common.mail import send as mail_send

from ..models import Notification
from .immediate import render_notification_email
from .preferences import SECURITY_TYPES
from .routing import resolve_cc


def render_and_send(n: Notification) -> str:
    """Send one notification email. Returns 'sent' or 'skipped'. Raises on transport error."""
    if not n.user.email:
        return "skipped"
    subject, text, html = render_notification_email(n)
    category = "transactional" if n.type in SECURITY_TYPES else "notification"
    sent = mail_send(
        org_id=n.org_id,
        subject=subject,
        body=text,
        html_body=html,
        to=[n.user.email],
        cc=resolve_cc(n),
        category=category,
        append_signature=True,
        fail_silently=False,
    )
    return "sent" if sent else "skipped"  # sent==False => org kill-switch => skipped
