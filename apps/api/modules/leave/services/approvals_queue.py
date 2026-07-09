"""Leave Approvals workspace — tabbed list + summary for an approver.

Mirrors ``modules/claims/services/approvals_queue.py``. Rows come from the
approver's ``LeaveApproval`` records so Awaiting/Approved/Rejected/All all work
off real history. ``LeaveRequest.employee_id`` is a plain UUID (not an FK), so
employees are batch-fetched into a map rather than ``select_related``."""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING

from django.utils import timezone

from modules.employee.models import Employee
from modules.leave.models import LeaveApproval, LeaveRequest
from modules.leave.services.coverage import has_conflict

if TYPE_CHECKING:
    from modules.identity.models import User

OVERDUE_DAYS = 3


def _awaiting_ids(user: User) -> set:
    """Requests with a pending LeaveApproval for this user that are still open."""
    pending = LeaveApproval.objects.filter(approver_id=user.id, status="pending").values_list(
        "leave_request_id", flat=True
    )
    return set(
        LeaveRequest.all_objects.filter(
            id__in=pending, status="submitted", deleted_at__isnull=True
        ).values_list("id", flat=True)
    )


def _age(req: LeaveRequest) -> int:
    return (timezone.now().date() - req.submitted_at.date()).days if req.submitted_at else 0


def _row(req: LeaveRequest, emp: Employee | None, awaiting: set) -> dict:
    is_aw = req.id in awaiting
    age = _age(req)
    return {
        "kind": "leave",
        "id": str(req.id),
        "employee_id": str(req.employee_id),
        "employee_code": emp.employee_code if emp else "",
        "name": emp.full_name if emp else "",
        "department": emp.department.name if emp and emp.department_id else "",
        "type_code": req.leave_type.code,
        "summary": "",
        "deep_link": f"/leave/requests/{req.id}",
        "submitted_at": req.submitted_at.isoformat() if req.submitted_at else None,
        "detail": {
            "start_date": req.start_date.isoformat(),
            "end_date": req.end_date.isoformat(),
            "total_days": str(req.total_days),
            "is_half_day": req.is_half_day,
            "reason": req.reason,
        },
        "status": req.status,
        "actionable": is_aw,
        "age_days": age,
        "is_overdue": is_aw and age > OVERDUE_DAYS,
        "is_conflict": is_aw and has_conflict(req),
    }


def _emp_map(reqs: list[LeaveRequest]) -> dict:
    ids = {r.employee_id for r in reqs}
    return {e.id: e for e in Employee.all_objects.filter(id__in=ids).select_related("department")}


def list_for_approver(user: User, tab: str) -> list[dict]:
    awaiting = _awaiting_ids(user)
    if tab == "awaiting":
        ids = awaiting
    elif tab in ("approved", "rejected"):
        ids = set(
            LeaveApproval.objects.filter(approver_id=user.id, status=tab).values_list(
                "leave_request_id", flat=True
            )
        )
    else:  # all
        ids = awaiting | set(
            LeaveApproval.objects.filter(
                approver_id=user.id, status__in=("approved", "rejected")
            ).values_list("leave_request_id", flat=True)
        )
    reqs = list(
        LeaveRequest.all_objects.filter(
            id__in=ids, org_id=user.org_id, deleted_at__isnull=True
        ).select_related("leave_type")
    )
    emap = _emp_map(reqs)
    rows = [_row(r, emap.get(r.employee_id), awaiting) for r in reqs]
    # Urgency: overdue, then conflict, then oldest.
    rows.sort(key=lambda r: (not r["is_overdue"], not r["is_conflict"], -r["age_days"]))
    return rows


def summary_for_approver(user: User) -> dict:
    awaiting = _awaiting_ids(user)
    aw = list(
        LeaveRequest.all_objects.filter(
            id__in=awaiting, org_id=user.org_id, deleted_at__isnull=True
        ).select_related("leave_type")
    )
    ages = [_age(r) for r in aw if r.submitted_at]
    since = timezone.now() - datetime.timedelta(days=7)
    return {
        "awaiting_count": len(aw),
        "overdue_count": sum(1 for a in ages if a > OVERDUE_DAYS),
        "conflict_count": sum(1 for r in aw if has_conflict(r)),
        "oldest_days": max(ages) if ages else 0,
        "approved_this_week": LeaveApproval.objects.filter(
            approver_id=user.id, status="approved", acted_at__gte=since
        ).count(),
        "rejected_this_week": LeaveApproval.objects.filter(
            approver_id=user.id, status="rejected", acted_at__gte=since
        ).count(),
    }
