"""KPI cycle state machine."""

from __future__ import annotations

from common.workflow.exceptions import InvalidTransition

from ..models import KpiCycle

VALID_TRANSITIONS: dict[str, set[str]] = {
    "upcoming": {"self_review"},
    "self_review": {"manager_review"},
    "manager_review": {"closed"},
    "closed": set(),
}


class CycleService:
    @staticmethod
    def transition(cycle: KpiCycle, to_status: str) -> KpiCycle:
        if to_status not in VALID_TRANSITIONS.get(cycle.status, set()):
            raise InvalidTransition(f"Cannot transition {cycle.status!r} → {to_status!r}")
        cycle.status = to_status
        cycle.save(update_fields=["status", "updated_at"])
        return cycle
