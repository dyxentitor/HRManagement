"""Unified approvals inbox — merges pending leave + claim + KPI approvals for a user."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from modules.claims.models import ClaimApproval, ClaimRequest
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveRequest


def _emp_name(emp) -> str:
    if emp is None:
        return ""
    return f"{emp.first_name} {emp.last_name}".strip()


@dataclass
class InboxItem:
    kind: str  # 'leave', 'claim', or 'kpi'
    id: str  # request id
    employee_code: str
    summary: str  # human-readable summary
    submitted_at: datetime | None
    deep_link: str
    # Structured fields (v1.14.1) so the unified inbox can render rich cards +
    # team-coverage for leave without re-parsing `summary`.
    employee_id: str = ""
    name: str = ""
    type_code: str = ""
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "id": self.id,
            "employee_code": self.employee_code,
            "summary": self.summary,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "deep_link": self.deep_link,
            "employee_id": self.employee_id,
            "name": self.name,
            "type_code": self.type_code,
            "detail": self.detail,
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
                employee_id=str(r.employee_id),
                name=_emp_name(emp) or emp_code,
                type_code=r.leave_type.code,
                detail={
                    "start_date": r.start_date.isoformat(),
                    "end_date": r.end_date.isoformat(),
                    "total_days": str(r.total_days),
                    "is_half_day": r.is_half_day,
                    "reason": r.reason,
                },
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
                employee_id=str(c.employee_id),
                name=_emp_name(c.employee) or c.employee.employee_code,
                type_code=c.category.code,
                detail={
                    "amount": str(c.amount),
                    "currency_code": c.currency_code,
                    "expense_date": c.expense_date.isoformat(),
                },
            )
        )

    # KPI: assignments in manager_review cycle where the current user is the employee's manager
    try:
        from modules.employee.models import Employee as _EmpKpi
        from modules.kpi.models import KpiAssignment, KpiReview

        # Find employees whose direct manager is the current user
        managed_employees = _EmpKpi.all_objects.filter(
            manager__user=user,
            deleted_at__isnull=True,
        ).values_list("id", flat=True)

        kpi_assignments = KpiAssignment.all_objects.filter(
            employee_id__in=managed_employees,
            status="self_done",
            cycle__status="manager_review",
            deleted_at__isnull=True,
        ).select_related("cycle")

        for assignment in kpi_assignments:
            # Get the latest self-review for submitted_at
            self_review = (
                KpiReview.objects.filter(assignment=assignment, stage="self")
                .order_by("-submitted_at")
                .first()
            )
            emp = _EmpKpi.all_objects.filter(
                id=assignment.employee_id, deleted_at__isnull=True
            ).first()
            emp_code = emp.employee_code if emp else str(assignment.employee_id)
            cycle_name = assignment.cycle.name
            items.append(
                InboxItem(
                    kind="kpi",
                    id=str(assignment.id),
                    employee_code=emp_code,
                    summary=f"KPI {cycle_name} self-review",
                    submitted_at=self_review.submitted_at if self_review else None,
                    deep_link=f"/approvals?focus={assignment.id}",
                    employee_id=str(assignment.employee_id),
                    name=_emp_name(emp) or emp_code,
                    type_code="KPI",
                    detail={"cycle": cycle_name},
                )
            )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Failed to load KPI inbox items")

    items.sort(key=lambda i: i.submitted_at or datetime.min, reverse=True)
    return items
