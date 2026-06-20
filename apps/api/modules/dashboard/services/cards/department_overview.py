"""DepartmentOverview card — employee distribution by department."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class DepartmentOverview(Card):
    type: ClassVar[str] = "department_overview"
    requires_perms: ClassVar[list[str]] = ["employee:read:org"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from django.db.models import Count

        from modules.employee.models import Employee
        from modules.organization.models import Department

        counts = dict(
            Employee.all_objects.filter(org_id=user.org_id, deleted_at__isnull=True)
            .values_list("department_id")
            .annotate(n=Count("id"))
        )
        departments = [
            {"name": d.name, "count": counts.get(d.id, 0)}
            for d in Department.all_objects.filter(
                org_id=user.org_id, deleted_at__isnull=True
            ).order_by("name")
        ]

        return {
            "type": cls.type,
            "title": "Department overview",
            "data": {"departments": departments},
        }
