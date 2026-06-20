"""HeroSummary card — payroll countdown + working-day context for the hero header."""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class HeroSummary(Card):
    type: ClassVar[str] = "hero_summary"
    requires_perms: ClassVar[list[str]] = []

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.payslip.models import PayrollPeriod

        today = datetime.date.today()
        period = (
            PayrollPeriod.all_objects.filter(
                org_id=user.org_id,
                deleted_at__isnull=True,
                pay_date__gte=today,
            )
            .exclude(status="completed")
            .order_by("pay_date")
            .first()
        )
        next_payroll_date = period.pay_date.isoformat() if period else None
        days_to_payroll = (period.pay_date - today).days if period else None

        return {
            "type": cls.type,
            "title": "Today",
            "data": {
                "today": today.isoformat(),
                "working_day": today.strftime("%A"),
                "next_payroll_date": next_payroll_date,
                "days_to_payroll": days_to_payroll,
            },
        }
