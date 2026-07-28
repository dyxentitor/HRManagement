"""Email digest service -- batches pending email notifications hourly."""

from __future__ import annotations

import logging
from collections import defaultdict

from django.conf import settings
from django.utils import timezone

from common.mail import send as mail_send
from common.mail.render import render_email
from modules.notification.labels import domain_label, domain_of, label_for
from modules.notification.models import EmailDigestRun, Notification
from modules.notification.services.cards import build_card

logger = logging.getLogger(__name__)


def _item_label(n: Notification) -> str:
    """Return the enriched card headline for *n*, falling back to the bare label."""
    try:
        return build_card(n).headline
    except Exception:
        return label_for(n.type)


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
        groups_map: dict[str, list[Notification]] = defaultdict(list)
        for n in notifs:
            groups_map[domain_of(n.type)].append(n)
        groups_ctx = [
            {
                "heading": domain_label(items[0].type),
                "items": [
                    {"label": _item_label(n),
                     "link": f"{base}{n.deep_link}" if n.deep_link else base}
                    for n in items
                ],
            }
            for items in groups_map.values()
        ]
        subject, body, html_body = render_email(
            "digest", {"count": len(notifs), "groups": groups_ctx}, org_id=user.org_id
        )

        try:
            sent = mail_send(
                org_id=user.org_id,
                subject=subject,
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
