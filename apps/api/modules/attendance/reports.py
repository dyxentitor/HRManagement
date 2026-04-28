"""Attendance module reports."""

from __future__ import annotations

from typing import ClassVar

from common.reporting.registry import Report, register

from .models import AttendanceRecord


@register
class AttendanceDailySummary(Report):
    code = "attendance.daily_summary"
    title = "Daily attendance summary"
    permissions: ClassVar[list] = ["attendance:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "work_date", "label": "Date"},
        {"field": "clock_in", "label": "Clock in"},
        {"field": "clock_out", "label": "Clock out"},
        {"field": "status", "label": "Status"},
    ]
    filters: ClassVar[list] = [
        {"field": "date", "type": "date", "label": "Date"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = AttendanceRecord.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
        ).select_related("employee")
        if filters.get("date"):
            qs = qs.filter(work_date=filters["date"])
        return qs.order_by("work_date", "employee__employee_code")


@register
class AttendanceLateAbsentLog(Report):
    code = "attendance.late_absent_log"
    title = "Late/absent log"
    permissions: ClassVar[list] = ["attendance:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "work_date", "label": "Date"},
        {"field": "status", "label": "Status"},
        {"field": "notes", "label": "Notes"},
    ]
    filters: ClassVar[list] = [
        {"field": "date_from", "type": "date", "label": "From"},
        {"field": "date_to", "type": "date", "label": "To"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = AttendanceRecord.all_objects.filter(
            org_id=user.org_id,
            status__in=("late", "absent"),
            deleted_at__isnull=True,
        ).select_related("employee")
        if filters.get("date_from"):
            qs = qs.filter(work_date__gte=filters["date_from"])
        if filters.get("date_to"):
            qs = qs.filter(work_date__lte=filters["date_to"])
        return qs.order_by("-work_date", "employee__employee_code")
