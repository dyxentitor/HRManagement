"""ActivityFeed card — recent meaningful org activity as a timeline.

Filters out passive view/audit noise (e.g. admin.overview_viewed) and resolves
the actor's name + department for a readable timeline.
"""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card

# Actions we never surface as "activity" (passive views / page-open audits).
_NOISE = ("viewed", "_view", "opened", "listed", "exported")


def _is_noise(action: str) -> bool:
    a = action.lower()
    return a.startswith("admin.") or any(tok in a for tok in _NOISE)


class ActivityFeed(Card):
    type: ClassVar[str] = "activity_feed"
    requires_perms: ClassVar[list[str]] = ["dashboard:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from common.audit.models import AuditLog
        from modules.employee.models import Employee
        from modules.organization.models import Department

        rows = [
            r
            for r in AuditLog.objects.filter(org_id=user.org_id).order_by("-ts")[:60]
            if not _is_noise(r.action)
        ][:15]

        # Resolve actor name + department in bulk (actor_id is a User id).
        actor_ids = {r.actor_id for r in rows if r.actor_id}
        names: dict = {}
        dept_ids: dict = {}
        if actor_ids:
            for emp in Employee.all_objects.filter(user_id__in=actor_ids, deleted_at__isnull=True):
                names[emp.user_id] = f"{emp.first_name} {emp.last_name}".strip()
                dept_ids[emp.user_id] = emp.department_id
        dept_names = dict(
            Department.all_objects.filter(id__in=[d for d in dept_ids.values() if d]).values_list(
                "id", "name"
            )
        )

        items = [
            {
                "ts": r.ts.isoformat(),
                "actor": names.get(r.actor_id) or "System",
                "department": dept_names.get(dept_ids.get(r.actor_id)) or "",
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
