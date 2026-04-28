"""KPI module reports."""

from __future__ import annotations

from typing import ClassVar

from common.reporting.registry import Report, register

from .models import KpiAssignment


@register
class KpiCycleProgress(Report):
    code = "kpi.cycle_progress"
    title = "KPI cycle progress"
    permissions: ClassVar[list] = ["kpi:cycle:read"]
    columns: ClassVar[list] = [
        {"field": "cycle__name", "label": "Cycle"},
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "template__name", "label": "Template"},
        {"field": "status", "label": "Status"},
    ]
    filters: ClassVar[list] = [
        {"field": "cycle_status", "type": "select", "label": "Cycle status"},
        {"field": "assignment_status", "type": "select", "label": "Assignment status"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = KpiAssignment.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
        ).select_related("cycle", "template")
        if filters.get("cycle_status"):
            qs = qs.filter(cycle__status=filters["cycle_status"])
        if filters.get("assignment_status"):
            qs = qs.filter(status=filters["assignment_status"])
        return qs.order_by("cycle__name", "employee_id")
