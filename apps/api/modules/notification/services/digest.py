"""Email digest service -- batches pending email notifications hourly."""

from __future__ import annotations

import logging
from collections import defaultdict

from django.conf import settings
from django.utils import timezone

from common.mail import send as mail_send
from modules.notification.labels import domain_label, domain_of, label_for
from modules.notification.models import EmailDigestRun, Notification

logger = logging.getLogger(__name__)


def send_digests() -> dict[str, int]:
    """For each user with pending email notifications, send one digest + mark sent."""
    pending = (
        Notification.objects.filter(
            channel="email",
            delivery_status="pending",
        )
        .select_related("user")
        .order_by("user_id", "-priority", "created_at")
    )

    by_user: dict[int, list[Notification]] = defaultdict(list)
    for n in pending:
        by_user[n.user_id].append(n)

    n_users = 0
    n_notifs = 0
    for _user_id, notifs in by_user.items():
        user = notifs[0].user
        if not user.email:
            # No email address; mark skipped
            for n in notifs:
                n.delivery_status = "skipped"
                n.sent_at = timezone.now()
                n.save(update_fields=["delivery_status", "sent_at"])
            continue

        base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
        groups: dict[str, list[Notification]] = defaultdict(list)
        for n in notifs:
            groups[domain_of(n.type)].append(n)

        text_lines = [f"You have {len(notifs)} new HRMS notification(s):", ""]
        html_parts = [f"<p>You have {len(notifs)} new HRMS notification(s):</p>"]
        for _domain, items in groups.items():
            heading = domain_label(items[0].type)
            text_lines.append(f"{heading}:")
            html_parts.append(f"<h3>{heading}</h3><ul>")
            for n in items:
                link = f"{base}{n.deep_link}" if n.deep_link else base
                text_lines.append(f"  - {label_for(n.type)} — {link}")
                html_parts.append(f'<li><a href="{link}">{label_for(n.type)}</a></li>')
            html_parts.append("</ul>")
            text_lines.append("")
        body = "\n".join(text_lines)
        html_body = "".join(html_parts)

        try:
            sent = mail_send(
                org_id=user.org_id,
                subject=f"[HRMS] {len(notifs)} new notification(s)",
                body=body,
                html_body=html_body,
                to=[user.email],
                category="notification",
                append_signature=True,
                fail_silently=False,
            )
            if not sent:
                # Notifications globally disabled — leave rows pending for a later run.
                continue
            run = EmailDigestRun.objects.create(
                org_id=user.org_id,
                user=user,
                notification_count=len(notifs),
            )
            run.notifications.set(notifs)
            for n in notifs:
                n.delivery_status = "sent"
                n.sent_at = timezone.now()
                n.save(update_fields=["delivery_status", "sent_at"])
            n_users += 1
            n_notifs += len(notifs)
        except Exception:
            for n in notifs:
                n.send_attempts += 1
                if n.send_attempts >= 3:
                    n.delivery_status = "failed"
                    logger.error(
                        "Email digest permanently failed for notification %s "
                        "(user %s) after %s attempts",
                        n.id,
                        user.id,
                        n.send_attempts,
                    )
                n.save(update_fields=["send_attempts", "delivery_status"])

    return {"users": n_users, "notifications": n_notifs}
