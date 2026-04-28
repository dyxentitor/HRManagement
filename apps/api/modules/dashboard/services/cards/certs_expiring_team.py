"""CertsExpiringTeam card — certifications expiring within 60 days for team."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class CertsExpiringTeam(Card):
    type: ClassVar[str] = "certs_expiring_team"
    requires_perms: ClassVar[list[str]] = ["cert:read:team"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.certification.models import Certification
        from modules.employee.models import Employee

        today = datetime.date.today()
        cutoff = today + datetime.timedelta(days=60)

        # Get direct-report employee IDs
        manager_emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        team_ids: list = []
        if manager_emp:
            team_ids = list(
                Employee.all_objects.filter(
                    manager_id=manager_emp.id, deleted_at__isnull=True
                ).values_list("id", flat=True)
            )

        certs = Certification.all_objects.filter(
            employee_id__in=team_ids,
            expires_on__range=(today, cutoff),
            status="active",
            deleted_at__isnull=True,
        ).order_by("expires_on")[:10]

        return {
            "type": cls.type,
            "title": "Team certs expiring soon",
            "data": {
                "certs": [
                    {
                        "employee_id": str(c.employee_id),
                        "name": c.name,
                        "expires_on": c.expires_on.isoformat() if c.expires_on else None,
                    }
                    for c in certs
                ],
            },
        }
