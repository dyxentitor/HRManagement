"""Email digest service -- batches pending email notifications hourly."""

from __future__ import annotations

from collections import defaultdict

from django.utils import timezone

from common.mail import send as mail_send
from modules.notification.models import EmailDigestRun, Notification


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

        body_lines = [f"You have {len(notifs)} new HRMS notification(s):", ""]
        for n in notifs:
            body_lines.append(f"  - [{n.type}] -- {n.payload}")
        body = "\n".join(body_lines)

        try:
            sent = mail_send(
                org_id=user.org_id,
                subject=f"[HRMS] {len(notifs)} new notification(s)",
                body=body,
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
                n.delivery_status = "failed"
                n.save(update_fields=["delivery_status"])

    return {"users": n_users, "notifications": n_notifs}
