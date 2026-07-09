"""Team-coverage helpers for leave approvals.

`has_conflict` answers the one question an approver's queue needs: is anyone on
this person's team already off during the requested window? It is a focused,
standalone helper (the richer per-day / named breakdown lives in
``LeaveCoverageView`` and the review drawer)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from modules.employee.models import Employee
from modules.leave.models import LeaveRequest

if TYPE_CHECKING:
    pass


def has_conflict(req: LeaveRequest) -> bool:
    """True when a peer (same manager, else same department) has an approved or
    submitted leave overlapping ``req``'s date window."""
    emp = Employee.all_objects.filter(id=req.employee_id).first()
    if emp is None:
        return False
    peers = Employee.all_objects.filter(org_id=req.org_id, deleted_at__isnull=True).exclude(
        id=emp.id
    )
    if emp.manager_id:
        peers = peers.filter(manager_id=emp.manager_id)
    elif emp.department_id:
        peers = peers.filter(department_id=emp.department_id)
    else:
        return False
    peer_ids = list(peers.values_list("id", flat=True))
    if not peer_ids:
        return False
    return (
        LeaveRequest.all_objects.filter(
            org_id=req.org_id,
            employee_id__in=peer_ids,
            status__in=("approved", "submitted"),
            start_date__lte=req.end_date,
            end_date__gte=req.start_date,
            deleted_at__isnull=True,
        )
        .exclude(id=req.id)
        .exists()
    )
