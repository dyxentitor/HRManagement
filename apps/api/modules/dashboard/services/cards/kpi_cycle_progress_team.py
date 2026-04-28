"""KpiCycleProgressTeam card — active KPI cycle progress for team members."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class KpiCycleProgressTeam(Card):
    type: ClassVar[str] = "kpi_cycle_progress_team"
    requires_perms: ClassVar[list[str]] = ["kpi:assignment:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.employee.models import Employee
        from modules.kpi.models import KpiAssignment, KpiCycle

        manager_emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        team_ids: list = []
        if manager_emp:
            team_ids = list(
                Employee.all_objects.filter(
                    manager_id=manager_emp.id, deleted_at__isnull=True
                ).values_list("id", flat=True)
            )

        active_cycle = (
            KpiCycle.all_objects.filter(
                org_id=user.org_id, status="active", deleted_at__isnull=True
            )
            .order_by("-starts_on")
            .first()
        )
        if active_cycle is None:
            return {"type": cls.type, "title": "Team KPI cycle", "data": {"cycle": None}}

        assignments = KpiAssignment.all_objects.filter(
            cycle=active_cycle, employee_id__in=team_ids, deleted_at__isnull=True
        )
        total = assignments.count()
        completed = assignments.filter(status="completed").count()
        return {
            "type": cls.type,
            "title": "Team KPI cycle",
            "data": {
                "cycle": active_cycle.name,
                "ends_on": active_cycle.ends_on.isoformat(),
                "total": total,
                "completed": completed,
            },
        }
