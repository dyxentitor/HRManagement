"""Leave module reports."""

from __future__ import annotations

from typing import ClassVar

from django.db.models import QuerySet

from common.reporting.registry import Report, register

from .models import LeaveBalance, LeaveRequest


@register
class LeaveBalanceSummary(Report):
    code = "leave.balance_summary"
    title = "Leave balance summary"
    permissions: ClassVar[list] = ["leave:balance:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "year", "label": "Year"},
        {"field": "entitled", "label": "Entitled"},
        {"field": "accrued", "label": "Accrued"},
        {"field": "taken", "label": "Taken"},
    ]
    filters: ClassVar[list] = [
        {"field": "year", "type": "number", "label": "Year"},
        {"field": "leave_type_code", "type": "select", "label": "Leave type"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters: dict, user) -> QuerySet:
        qs = LeaveBalance.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
        ).select_related("leave_type")
        if filters.get("year"):
            qs = qs.filter(year=int(filters["year"]))
        if filters.get("leave_type_code"):
            qs = qs.filter(leave_type__code=filters["leave_type_code"])
        return qs.order_by("employee_id", "leave_type__code", "year")


@register
class LeaveTakenPeriod(Report):
    code = "leave.taken_period"
    title = "Leave taken (period)"
    permissions: ClassVar[list] = ["leave:request:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "start_date", "label": "Start"},
        {"field": "end_date", "label": "End"},
        {"field": "total_days", "label": "Days"},
        {"field": "status", "label": "Status"},
    ]
    filters: ClassVar[list] = [
        {"field": "date_from", "type": "date", "label": "From"},
        {"field": "date_to", "type": "date", "label": "To"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters: dict, user) -> QuerySet:
        qs = LeaveRequest.all_objects.filter(
            org_id=user.org_id,
            status="approved",
            deleted_at__isnull=True,
        ).select_related("leave_type")
        if filters.get("date_from"):
            qs = qs.filter(start_date__gte=filters["date_from"])
        if filters.get("date_to"):
            qs = qs.filter(end_date__lte=filters["date_to"])
        return qs.order_by("-start_date")


@register
class LeavePendingApprovals(Report):
    code = "leave.pending_approvals"
    title = "Pending leave approvals"
    permissions: ClassVar[list] = ["leave:request:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "start_date", "label": "Start"},
        {"field": "total_days", "label": "Days"},
        {"field": "submitted_at", "label": "Submitted"},
    ]
    filters: ClassVar[list] = []
    exporters: ClassVar[list] = ["csv"]

    @classmethod
    def queryset(cls, *, filters: dict, user) -> QuerySet:
        return (
            LeaveRequest.all_objects.filter(
                org_id=user.org_id,
                status="submitted",
                deleted_at__isnull=True,
            )
            .select_related("leave_type")
            .order_by("submitted_at")
        )
