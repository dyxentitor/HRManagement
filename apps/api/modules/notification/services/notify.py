"""notify() -- the public API used by other modules."""

from __future__ import annotations

import logging
from typing import Any

from modules.identity.models import User

from ..models import Notification
from ..tasks import send_notification_email
from .preferences import is_enabled
from .routing import routing_for

logger = logging.getLogger(__name__)


def notify(
    *,
    user: User,
    type: str,
    payload: dict[str, Any] | None = None,
    deep_link: str = "",
    priority: str = "normal",
    cc_context: dict[str, Any] | None = None,
) -> list[Notification]:
    """Create notification rows for the user across enabled channels.

    Returns the list of rows actually created (one per enabled channel).

    Two gates apply, in order: the org-level `NotificationRouting` kill-switch,
    then the user's own `NotificationPreference`. Org OFF suppresses a channel
    for everyone; org ON defers to the personal preference.

    Email rows whose routing resolves to the immediate lane are enqueued to the
    send_notification_email Celery task. Under eager-propagates test settings,
    task failures are caught here so notify() remains best-effort and never
    raises into the caller.

    `cc_context` binds context CC tokens for this event, e.g.
    {"approver": str(user.id)}. It is stored on each row and consumed by
    services.routing.resolve_cc at send time.
    """
    payload = payload or {}
    created: list[Notification] = []
    routing = routing_for(user.org_id, type)

    for channel in ("in_app", "email"):
        if not routing.channel_enabled(channel):
            continue
        if not is_enabled(user=user, type_code=type, channel=channel):
            continue
        n = Notification.objects.create(
            org_id=user.org_id,
            user=user,
            type=type,
            channel=channel,
            payload=payload,
            cc_context=cc_context or {},
            deep_link=deep_link,
            priority=priority,
        )
        created.append(n)
        if channel == "email" and routing.is_immediate(priority):
            try:
                send_notification_email.delay(n.id)
            except Exception:
                logger.warning(
                    "Immediate email enqueue/send failed for notification %s; "
                    "left for digest (any CC on this type will be lost)",
                    n.id,
                )
    return created
