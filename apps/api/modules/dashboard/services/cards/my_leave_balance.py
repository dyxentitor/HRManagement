"""MyLeaveBalance card — own leave balances for the current year."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class MyLeaveBalance(Card):
    type: ClassVar[str] = "my_leave_balance"
    requires_perms: ClassVar[list[str]] = ["leave:balance:read:self"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.employee.models import Employee
        from modules.leave.models import LeaveBalance

        emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        if emp is None:
            return {"type": cls.type, "title": "My leave balance", "data": {"balances": []}}
        year = datetime.date.today().year
        balances = LeaveBalance.all_objects.filter(
            employee_id=emp.id, year=year, deleted_at__isnull=True
        ).select_related("leave_type")
        return {
            "type": cls.type,
            "title": "My leave balance",
            "data": {
                "year": year,
                "balances": [
                    {
                        "code": b.leave_type.code,
                        "entitled": str(b.entitled),
                        "taken": str(b.taken),
                        "pending": str(b.pending),
                        "available": str(b.entitled - b.taken - b.pending),
                    }
                    for b in balances
                ],
            },
        }
