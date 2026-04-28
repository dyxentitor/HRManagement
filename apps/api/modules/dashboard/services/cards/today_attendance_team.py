"""TodayAttendanceTeam card — today's clock-in count for team."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class TodayAttendanceTeam(Card):
    type: ClassVar[str] = "today_attendance_team"
    requires_perms: ClassVar[list[str]] = ["attendance:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.attendance.models import AttendanceRecord
        from modules.employee.models import Employee

        today = datetime.date.today()
        manager_emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        team_ids: list = []
        if manager_emp:
            team_ids = list(
                Employee.all_objects.filter(
                    manager_id=manager_emp.id, deleted_at__isnull=True
                ).values_list("id", flat=True)
            )
        team_size = len(team_ids)
        present = AttendanceRecord.all_objects.filter(
            employee_id__in=team_ids,
            work_date=today,
            clock_in__isnull=False,
            deleted_at__isnull=True,
        ).count()
        return {
            "type": cls.type,
            "title": "Team attendance today",
            "data": {
                "date": today.isoformat(),
                "present": present,
                "team_size": team_size,
            },
        }
