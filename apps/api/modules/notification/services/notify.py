"""notify() -- the public API used by other modules."""

from __future__ import annotations

import logging
from typing import Any

from modules.identity.models import User

from ..models import Notification
from ..tasks import send_notification_email
from .preferences import SECURITY_TYPES, is_enabled

logger = logging.getLogger(__name__)


def notify(
    *,
    user: User,
    type: str,
    payload: dict[str, Any] | None = None,
    deep_link: str = "",
    priority: str = "normal",
) -> list[Notification]:
    """Create notification rows for the user across enabled channels.

    Returns the list of rows actually created (one per enabled channel).

    For email rows that are security-type or urgent/high priority, the
    send_notification_email Celery task is enqueued immediately (async lane).
    Under eager-propagates test settings, task failures are caught here so
    notify() remains best-effort and never raises into the caller.
    """
    payload = payload or {}
    created: list[Notification] = []

    for channel in ("in_app", "email"):
        if not is_enabled(user=user, type_code=type, channel=channel):
            continue
        n = Notification.objects.create(
            org_id=user.org_id,
            user=user,
            type=type,
            channel=channel,
            payload=payload,
            deep_link=deep_link,
            priority=priority,
        )
        created.append(n)
        if channel == "email" and (type in SECURITY_TYPES or priority in ("urgent", "high")):
            try:
                send_notification_email.delay(n.id)
            except Exception:
                logger.warning(
                    "Immediate email enqueue/send failed for notification %s; left for digest",
                    n.id,
                )
    return created
