"""UpcomingHolidays card — next 5 holidays for the user's org."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class UpcomingHolidays(Card):
    type: ClassVar[str] = "upcoming_holidays"
    requires_perms: ClassVar[list[str]] = ["schedule:holiday:read"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.schedule.models import Holiday

        today = datetime.date.today()
        holidays = list(
            Holiday.all_objects.filter(
                org_id=user.org_id,
                date__gte=today,
                deleted_at__isnull=True,
            ).order_by("date")[:5]
        )
        return {
            "type": cls.type,
            "title": "Upcoming holidays",
            "data": {
                "holidays": [
                    {"date": h.date.isoformat(), "name": h.name, "type": h.type} for h in holidays
                ],
            },
        }
