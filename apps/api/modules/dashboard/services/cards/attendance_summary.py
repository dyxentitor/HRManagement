"""AttendanceSummary card — today's attendance status breakdown.

Org-wide when the user holds attendance:read:org, otherwise scoped to the user's
direct reports (team).
"""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card

_STATUSES = ("present", "late", "absent", "on_leave", "partial")


class AttendanceSummary(Card):
    type: ClassVar[str] = "attendance_summary"
    requires_perms: ClassVar[list[str]] = ["attendance:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.attendance.models import AttendanceRecord
        from modules.employee.models import Employee
        from modules.identity.services.permissions import get_user_perms

        today = datetime.date.today()
        perms = get_user_perms(user)

        base = AttendanceRecord.all_objects.filter(
            org_id=user.org_id, work_date=today, deleted_at__isnull=True
        )
        if "attendance:read:org" in perms:
            team_size = Employee.all_objects.filter(
                org_id=user.org_id, deleted_at__isnull=True
            ).count()
        else:
            manager_emp = Employee.all_objects.filter(
                user_id=user.id, deleted_at__isnull=True
            ).first()
            team_ids: list = []
            if manager_emp:
                team_ids = list(
                    Employee.all_objects.filter(
                        manager_id=manager_emp.id, deleted_at__isnull=True
                    ).values_list("id", flat=True)
                )
            base = base.filter(employee_id__in=team_ids)
            team_size = len(team_ids)

        counts = {s: base.filter(status=s).count() for s in _STATUSES}

        return {
            "type": cls.type,
            "title": "Attendance today",
            "data": {
                "date": today.isoformat(),
                "team_size": team_size,
                **counts,
            },
        }
