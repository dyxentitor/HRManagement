"""Fan-out notifications when a KPI cycle transitions to self/manager review."""

from __future__ import annotations

import logging

from modules.employee.models import Employee
from modules.kpi.models import KpiAssignment
from modules.notification.services.notify import notify

logger = logging.getLogger(__name__)


def _participants(cycle) -> list[Employee]:
    ids = list(
        KpiAssignment.all_objects.filter(cycle=cycle).values_list("employee_id", flat=True)
    )
    return list(Employee.all_objects.filter(id__in=ids).select_related("user", "manager__user"))


def notify_cycle_self_review(cycle) -> int:
    """Notify each participant that the self-review window has opened.

    Best-effort per participant: a missing user or any notify() failure is
    logged and skipped so one bad row doesn't abort the whole fan-out.

    Returns the number of notifications successfully sent.
    """
    sent = 0
    for emp in _participants(cycle):
        user = getattr(emp, "user", None)
        if user is None:
            continue
        try:
            notify(
                user=user,
                type="kpi.cycle_opens_self_review",
                payload={"cycle": cycle.name},
                deep_link="/kpi/me",
                priority="normal",
            )
            sent += 1
        except Exception:
            logger.exception(
                "KPI self-review notify failed for employee %s", emp.id
            )
    return sent


def notify_cycle_manager_review(cycle) -> int:
    """Notify each distinct manager that the manager-review window has opened.

    Deduplicates by manager User.id so a manager with multiple direct reports
    in the cycle receives only one notification.

    Best-effort per manager: any notify() failure is logged and skipped.

    Returns the number of notifications successfully sent (one per distinct manager).
    """
    managers: dict = {}
    for emp in _participants(cycle):
        mgr = getattr(emp, "manager", None)
        if mgr is None:
            continue
        mgr_user = getattr(mgr, "user", None)
        if mgr_user is not None:
            managers[mgr_user.id] = mgr_user
    sent = 0
    for user in managers.values():
        try:
            notify(
                user=user,
                type="kpi.cycle_opens_manager_review",
                payload={"cycle": cycle.name},
                deep_link="/kpi/admin",
                priority="normal",
            )
            sent += 1
        except Exception:
            logger.exception(
                "KPI manager-review notify failed for user %s", user.id
            )
    return sent
