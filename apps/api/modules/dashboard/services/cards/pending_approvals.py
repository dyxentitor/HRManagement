"""PendingApprovals card — count of pending items in user's inbox."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class PendingApprovals(Card):
    type: ClassVar[str] = "pending_approvals"
    requires_perms: ClassVar[list[str]] = ["approvals:inbox:read"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.dashboard.services.inbox import get_inbox

        items = get_inbox(user=user)
        return {
            "type": cls.type,
            "title": "Pending approvals",
            "data": {
                "count": len(items),
                "items": [i.to_dict() for i in items[:5]],
            },
        }
