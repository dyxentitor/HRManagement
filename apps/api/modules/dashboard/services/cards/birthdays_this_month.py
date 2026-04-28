"""BirthdaysThisMonth card — org members with birthdays this month."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class BirthdaysThisMonth(Card):
    type: ClassVar[str] = "birthdays_this_month"
    requires_perms: ClassVar[list[str]] = ["employee:read:org"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.employee.models import Employee

        today = datetime.date.today()
        employees = Employee.all_objects.filter(
            org_id=user.org_id,
            date_of_birth__month=today.month,
            deleted_at__isnull=True,
        ).order_by("date_of_birth__day")[:20]
        return {
            "type": cls.type,
            "title": "Birthdays this month",
            "data": {
                "month": today.strftime("%B %Y"),
                "birthdays": [
                    {
                        "employee_code": e.employee_code,
                        "name": f"{e.first_name} {e.last_name}",
                        "day": e.date_of_birth.day,
                    }
                    for e in employees
                ],
            },
        }
