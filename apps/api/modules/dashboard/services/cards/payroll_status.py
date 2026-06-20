"""PayrollStatus card — 5-stage payroll workflow stepper for the current period."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card

_STAGES = ("draft", "approved", "ready", "processing", "completed")
_STAGE_LABELS = {
    "draft": "Draft",
    "approved": "Approved",
    "ready": "Ready",
    "processing": "Processing",
    "completed": "Completed",
}


class PayrollStatus(Card):
    type: ClassVar[str] = "payroll_status"
    requires_perms: ClassVar[list[str]] = ["payroll:run:create"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.payslip.models import PayrollPeriod

        # Prefer the most recent not-yet-completed period; fall back to the latest.
        qs = PayrollPeriod.all_objects.filter(org_id=user.org_id, deleted_at__isnull=True).order_by(
            "-period_start"
        )
        period = qs.exclude(status="completed").first() or qs.first()

        current = period.status if period else None
        current_idx = _STAGES.index(current) if current in _STAGES else -1

        stages = []
        for idx, key in enumerate(_STAGES):
            if current_idx < 0:
                state = "upcoming"
            elif idx < current_idx:
                state = "done"
            elif idx == current_idx:
                state = "current"
            else:
                state = "upcoming"
            stages.append({"key": key, "label": _STAGE_LABELS[key], "state": state})

        return {
            "type": cls.type,
            "title": "Payroll status",
            "data": {
                "current": current,
                "pay_date": period.pay_date.isoformat() if period else None,
                "stages": stages,
            },
        }
