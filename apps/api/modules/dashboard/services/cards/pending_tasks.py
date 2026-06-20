"""PendingTasks card — the action engine: per-category pending counts + routes.

Each task is emitted only when the user holds the relevant permission, so the
card is safe to include in every dashboard variant (it self-filters).
"""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class PendingTasks(Card):
    type: ClassVar[str] = "pending_tasks"
    requires_perms: ClassVar[list[str]] = []

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.identity.services.permissions import get_user_perms

        perms = get_user_perms(user)
        tasks: list[dict[str, Any]] = []

        if "approvals:inbox:read" in perms:
            from ..inbox import get_inbox

            inbox = get_inbox(user=user)
            leave = sum(1 for i in inbox if i.kind == "leave")
            claim = sum(1 for i in inbox if i.kind == "claim")
            kpi = sum(1 for i in inbox if i.kind == "kpi")
            tasks.append(
                {
                    "key": "leave_approvals",
                    "label": "Leave approvals",
                    "count": leave,
                    "tone": "peach",
                    "action_route": "/approvals",
                }
            )
            tasks.append(
                {
                    "key": "claim_approvals",
                    "label": "Claims awaiting approval",
                    "count": claim,
                    "tone": "coral",
                    "action_route": "/approvals",
                }
            )
            tasks.append(
                {
                    "key": "kpi_reviews",
                    "label": "KPI reviews",
                    "count": kpi,
                    "tone": "lavender",
                    "action_route": "/approvals",
                }
            )

        if "onboarding:read" in perms:
            from modules.onboarding.models import OnboardingChecklist

            n = OnboardingChecklist.all_objects.filter(
                org_id=user.org_id, status="in_progress", deleted_at__isnull=True
            ).count()
            tasks.append(
                {
                    "key": "onboarding",
                    "label": "New employee onboarding",
                    "count": n,
                    "tone": "sky",
                    "action_route": "/admin/onboarding",
                }
            )

        if "payroll:exception:read" in perms:
            from modules.payslip.models import PayrollException

            n = PayrollException.all_objects.filter(
                org_id=user.org_id, status="open", deleted_at__isnull=True
            ).count()
            tasks.append(
                {
                    "key": "payroll_exceptions",
                    "label": "Payroll exceptions",
                    "count": n,
                    "tone": "yellow",
                    "action_route": "/payroll/admin",
                }
            )

        if "attendance:read:team" in perms:
            from modules.attendance.models import AttendanceRecord
            from modules.employee.models import Employee

            today = datetime.date.today()
            base = AttendanceRecord.all_objects.filter(
                org_id=user.org_id,
                work_date=today,
                status__in=("absent", "partial"),
                deleted_at__isnull=True,
            )
            if "attendance:read:org" not in perms:
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
            tasks.append(
                {
                    "key": "attendance_issues",
                    "label": "Attendance issues",
                    "count": base.count(),
                    "tone": "mint",
                    "action_route": "/schedule/roster",
                }
            )

        return {
            "type": cls.type,
            "title": "Pending tasks",
            "data": {"tasks": tasks},
        }
