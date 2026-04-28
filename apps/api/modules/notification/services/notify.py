"""notify() -- the public API used by other modules."""

from __future__ import annotations

from typing import Any

from modules.identity.models import User

from ..models import Notification
from .preferences import is_enabled


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
    return created
