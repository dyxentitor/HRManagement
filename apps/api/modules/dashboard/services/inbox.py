"""Unified approvals inbox — merges pending leave + claim approvals for a user."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from modules.claims.models import ClaimApproval, ClaimRequest
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveRequest


@dataclass
class InboxItem:
    kind: str  # 'leave' or 'claim'
    id: str  # request id
    employee_code: str
    summary: str  # human-readable summary
    submitted_at: datetime | None
    deep_link: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "id": self.id,
            "employee_code": self.employee_code,
            "summary": self.summary,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "deep_link": self.deep_link,
        }


def get_inbox(*, user: User) -> list[InboxItem]:
    """Pending leave + claim items where this user is the current approver."""
    items: list[InboxItem] = []

    # Leave: requests where the user is the approver of a pending LeaveApproval row
    pending_leave_ids = LeaveApproval.objects.filter(
        approver_id=user.id,
        status="pending",
    ).values_list("leave_request_id", flat=True)
    leave_qs = LeaveRequest.all_objects.filter(
        id__in=pending_leave_ids,
        status="submitted",
        deleted_at__isnull=True,
    ).select_related("leave_type")
    from modules.employee.models import Employee as _Employee

    for r in leave_qs:
        emp = _Employee.all_objects.filter(id=r.employee_id, deleted_at__isnull=True).first()
        emp_code = emp.employee_code if emp else str(r.employee_id)
        items.append(
            InboxItem(
                kind="leave",
                id=str(r.id),
                employee_code=emp_code,
                summary=(
                    f"{r.leave_type.code} — {r.total_days} day(s)"
                    f" ({r.start_date} to {r.end_date})"
                ),
                submitted_at=r.submitted_at,
                deep_link=f"/approvals?focus={r.id}",
            )
        )

    # Claims: same pattern
    pending_claim_ids = ClaimApproval.objects.filter(
        approver_id=user.id,
        status="pending",
    ).values_list("claim_id", flat=True)
    claim_qs = ClaimRequest.all_objects.filter(
        id__in=pending_claim_ids,
        status__in=("submitted", "manager_approved"),
        deleted_at__isnull=True,
    ).select_related("employee", "category")
    for c in claim_qs:
        items.append(
            InboxItem(
                kind="claim",
                id=str(c.id),
                employee_code=c.employee.employee_code,
                summary=f"{c.category.code} — {c.currency_code} {c.amount} ({c.expense_date})",
                submitted_at=c.submitted_at,
                deep_link=f"/approvals?focus={c.id}",
            )
        )

    items.sort(key=lambda i: i.submitted_at or datetime.min, reverse=True)
    return items
