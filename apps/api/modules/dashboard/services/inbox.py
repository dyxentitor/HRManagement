"""Unified approvals inbox — merges pending leave + claim + KPI approvals for a user."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from modules.claims.models import ClaimRequest
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveRequest


def _emp_name(emp) -> str:
    if emp is None:
        return ""
    return f"{emp.first_name} {emp.last_name}".strip()


def _emp_dept(emp) -> str:
    dept = getattr(emp, "department", None) if emp is not None else None
    return getattr(dept, "name", "") or ""


@dataclass
class InboxItem:
    kind: str  # 'leave', 'claim', 'kpi', 'incentive', or 'shift_swap'
    id: str  # request id
    employee_code: str
    summary: str  # human-readable summary
    submitted_at: datetime | None
    deep_link: str
    # Structured fields (v1.14.1) so the unified inbox can render rich cards +
    # team-coverage for leave without re-parsing `summary`.
    employee_id: str = ""
    name: str = ""
    department: str = ""
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
            "department": self.department,
            "type_code": self.type_code,
            "detail": self.detail,
        }


def _claim_inbox_item(c) -> InboxItem:
    return InboxItem(
        kind="claim",
        id=str(c.id),
        employee_code=c.employee.employee_code,
        summary=f"{c.category.code} — {c.currency_code} {c.amount} ({c.expense_date})",
        submitted_at=c.submitted_at,
        deep_link=f"/approvals?focus={c.id}",
        employee_id=str(c.employee_id),
        name=_emp_name(c.employee) or c.employee.employee_code,
        department=_emp_dept(c.employee),
        type_code=c.category.code,
        detail={
            "amount": str(c.amount),
            "currency_code": c.currency_code,
            "expense_date": c.expense_date.isoformat(),
            "attachments": [
                {"id": a.id, "filename": a.filename, "size_bytes": a.size_bytes}
                for a in c.attachments.all()
            ],
        },
    )


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
        emp = (
            _Employee.all_objects.filter(id=r.employee_id, deleted_at__isnull=True)
            .select_related("department")
            .first()
        )
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
                department=_emp_dept(emp),
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

    # Claims I can act on now — structural (resolved approver) + permission pool.
    from modules.claims.services.approver_scope import actionable_claim_ids

    claim_qs = (
        ClaimRequest.all_objects.filter(
            id__in=actionable_claim_ids(user), deleted_at__isnull=True
        )
        .select_related("employee__department", "category")
        .prefetch_related("attachments")
    )
    for c in claim_qs:
        items.append(_claim_inbox_item(c))

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
            emp = (
                _EmpKpi.all_objects.filter(id=assignment.employee_id, deleted_at__isnull=True)
                .select_related("department")
                .first()
            )
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
                    department=_emp_dept(emp),
                    type_code="KPI",
                    detail={"cycle": cycle_name},
                )
            )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Failed to load KPI inbox items")

    # Incentive (mandays) claims the current user can review. Admins see every
    # pending claim in the org; a project owner sees pending claims on the
    # projects they manage. Mirrors ClaimViewSet._can_review / get_queryset.
    try:
        from modules.identity.services.permissions import get_user_perms
        from modules.incentive.models import Claim as _IncClaim
        from modules.incentive.models import Project as _IncProject

        inc_perms = get_user_perms(user)
        pending_claims = None
        if "incentive:admin" in inc_perms:
            pending_claims = _IncClaim.objects.filter(org_id=user.org_id, status="pending")
        elif "incentive:project:write" in inc_perms:
            mgr_emp = _Employee.all_objects.filter(user=user, deleted_at__isnull=True).first()
            if mgr_emp is not None:
                owned = _IncProject.objects.filter(
                    org_id=user.org_id, manager_id=mgr_emp.id
                ).values_list("id", flat=True)
                pending_claims = _IncClaim.objects.filter(
                    org_id=user.org_id, status="pending", project_id__in=list(owned)
                )

        if pending_claims is not None:
            for c in pending_claims.select_related("project", "project__customer"):
                emp = (
                    _Employee.all_objects.filter(id=c.employee_id, deleted_at__isnull=True)
                    .select_related("department")
                    .first()
                )
                emp_code = emp.employee_code if emp else str(c.employee_id)
                items.append(
                    InboxItem(
                        kind="incentive",
                        id=str(c.id),
                        employee_code=emp_code,
                        summary=f"{c.mandays} manday(s) — {c.project.name}",
                        submitted_at=c.created_at,
                        deep_link=f"/approvals?focus={c.id}",
                        employee_id=str(c.employee_id),
                        name=_emp_name(emp) or emp_code,
                        department=_emp_dept(emp),
                        type_code="MANDAY",
                        detail={
                            "mandays": str(c.mandays),
                            "project": c.project.name,
                            "customer": c.project.customer.name,
                            "note": c.note,
                        },
                    )
                )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Failed to load incentive inbox items")

    # Pending shift swaps this user can decide. Routing mirrors
    # modules.schedule.services.swap.resolve_approvers: the requester's
    # manager, else anyone holding schedule:swap:approve:team.
    try:
        from modules.schedule.models import ShiftSwapRequest
        from modules.schedule.services.swap import resolve_approvers

        pending_swaps = ShiftSwapRequest.all_objects.filter(
            org_id=user.org_id,
            status="pending",
            deleted_at__isnull=True,
        ).select_related(
            "requester__department",
            "requester__manager",
            "requester__manager__user",
            "counterparty",
            "requester_assignment__shift",
            "counterparty_assignment__shift",
        )
        for s in pending_swaps:
            if user.id not in {u.id for u in resolve_approvers(requester=s.requester)}:
                continue
            ra = s.requester_assignment
            ca = s.counterparty_assignment
            items.append(
                InboxItem(
                    kind="shift_swap",
                    id=str(s.id),
                    employee_code=s.requester.employee_code,
                    summary=(
                        f"{ra.work_date} {ra.shift.code} <-> "
                        f"{ca.work_date} {ca.shift.code} with {s.counterparty.full_name}"
                    ),
                    submitted_at=s.created_at,
                    deep_link=f"/approvals?focus={s.id}",
                    employee_id=str(s.requester_id),
                    name=s.requester.full_name or s.requester.employee_code,
                    department=_emp_dept(s.requester),
                    type_code="SWAP",
                    detail={
                        "requester_date": ra.work_date.isoformat(),
                        "requester_shift": ra.shift.name,
                        "counterparty_name": s.counterparty.full_name,
                        "counterparty_date": ca.work_date.isoformat(),
                        "counterparty_shift": ca.shift.name,
                        "reason": s.reason,
                    },
                )
            )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Failed to load shift-swap inbox items")

    items.sort(key=lambda i: i.submitted_at or datetime.min, reverse=True)
    return items
