"""EmployeeSnapshot card — org headcount breakdown for the snapshot donut."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class EmployeeSnapshot(Card):
    type: ClassVar[str] = "employee_snapshot"
    requires_perms: ClassVar[list[str]] = ["employee:read:org"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.employee.models import Employee

        today = datetime.date.today()
        first_of_month = today.replace(day=1)

        live = Employee.all_objects.filter(org_id=user.org_id, deleted_at__isnull=True)
        total = live.count()
        active = live.filter(status="active").count()
        on_leave = live.filter(status="on_leave").count()
        on_probation = live.filter(status="probation").count()
        # Resigned rows may be soft-deleted, so count across all_objects without the
        # deleted_at filter, scoped to this month by resignation_date.
        resigned_this_month = Employee.all_objects.filter(
            org_id=user.org_id,
            status="resigned",
            resignation_date__gte=first_of_month,
            resignation_date__lte=today,
        ).count()

        return {
            "type": cls.type,
            "title": "Employee overview",
            "data": {
                "total": total,
                "active": active,
                "on_leave": on_leave,
                "on_probation": on_probation,
                "resigned_this_month": resigned_this_month,
            },
        }
