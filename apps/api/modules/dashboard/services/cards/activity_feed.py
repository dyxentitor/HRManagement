"""ActivityFeed card — recent org audit-log entries as a timeline."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class ActivityFeed(Card):
    type: ClassVar[str] = "activity_feed"
    requires_perms: ClassVar[list[str]] = ["dashboard:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from common.audit.models import AuditLog
        from modules.employee.models import Employee

        rows = list(AuditLog.objects.filter(org_id=user.org_id).order_by("-ts")[:15])

        # Resolve actor display names in one query (actor_id is a User id).
        actor_ids = {r.actor_id for r in rows if r.actor_id}
        names: dict = {}
        if actor_ids:
            for emp in Employee.all_objects.filter(user_id__in=actor_ids, deleted_at__isnull=True):
                names[emp.user_id] = f"{emp.first_name} {emp.last_name}".strip()

        items = [
            {
                "ts": r.ts.isoformat(),
                "actor": names.get(r.actor_id) or "System",
                "action": r.action,
                "entity": r.entity,
                "entity_id": str(r.entity_id),
            }
            for r in rows
        ]

        return {
            "type": cls.type,
            "title": "Recent activity",
            "data": {"items": items},
        }
