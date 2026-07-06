"""LeaveRequestService — submit/approve/reject/cancel/withdraw, balance integration."""

from __future__ import annotations

import datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from common.workflow import (
    Decision,
    WorkflowEngine,
)
from modules.identity.models import User

from ..chains import LEAVE_DEFAULT
from ..models import LeaveBalance, LeaveRequest
from .balance import BalanceService


def is_user_on_approved_leave(user: User, on_date: datetime.date) -> bool:
    """Lookup used by the workflow engine for the leave-fallback routing rule."""
    from modules.employee.models import Employee

    emp = Employee.all_objects.filter(user_id=user.id).first()
    if emp is None:
        return False
    return LeaveRequest.objects.filter(
        employee_id=emp.id,
        status="approved",
        start_date__lte=on_date,
        end_date__gte=on_date,
    ).exists()


class LeaveRequestService:
    @staticmethod
    def _validate_eligibility(request: LeaveRequest) -> None:
        """v1.8.0 statutory eligibility checks.

        - requires_service_months: hire_date must be at least N months ago
        - notice_days_required:    start_date must be at least N days from today
        - max_per_lifetime_events: count of past approved requests of this type
                                   for this employee must be < cap
        """
        from modules.employee.models import Employee

        lt = request.leave_type
        today = timezone.localdate()
        emp = Employee.all_objects.get(id=request.employee_id)

        if lt.requires_service_months and lt.requires_service_months > 0:
            min_hire_date = today - datetime.timedelta(days=int(lt.requires_service_months) * 30)
            if emp.hire_date > min_hire_date:
                raise ValidationError(
                    {
                        "leave_type": (
                            f"{lt.name} requires "
                            f"{lt.requires_service_months} months of continuous service."
                        )
                    },
                )

        if lt.notice_days_required and lt.notice_days_required > 0:
            min_start = today + datetime.timedelta(days=int(lt.notice_days_required))
            if request.start_date < min_start:
                raise ValidationError(
                    {
                        "start_date": (
                            f"{lt.name} requires {lt.notice_days_required} days of advance notice."
                        )
                    },
                )

        if lt.max_per_lifetime_events and lt.max_per_lifetime_events > 0:
            past_count = (
                LeaveRequest.all_objects.filter(
                    org_id=request.org_id,
                    employee_id=request.employee_id,
                    leave_type=lt,
                    status="approved",
                    deleted_at__isnull=True,
                )
                .exclude(id=request.id)
                .count()
            )
            if past_count >= lt.max_per_lifetime_events:
                term = "confinements" if lt.code in ("MATERNITY", "PATERNITY") else "events"
                raise ValidationError(
                    {
                        "leave_type": (
                            f"Maximum {lt.max_per_lifetime_events} {term} reached for {lt.name}."
                        )
                    },
                )

        # v1.18.0 — balance over-draw guard. Paid leave types cannot be submitted
        # for more days than the employee currently has available
        # (available = accrued + carried_forward - taken - pending). Unpaid types
        # (is_paid=False) draw no balance and are exempt.
        if lt.is_paid:
            bal = LeaveBalance.all_objects.filter(
                org_id=request.org_id,
                employee_id=request.employee_id,
                leave_type=lt,
                year=request.start_date.year,
                deleted_at__isnull=True,
            ).first()
            available = bal.available if bal else Decimal("0")
            if request.total_days > available:
                raise ValidationError(
                    {
                        "total_days": (
                            f"Insufficient {lt.name} balance — you have {available} "
                            f"day(s) available but requested {request.total_days}."
                        )
                    },
                )

    @staticmethod
    def submit(request: LeaveRequest, actor: User) -> LeaveRequest:
        """Engine.submit + hold balance pending."""
        LeaveRequestService._validate_eligibility(request)  # v1.8.0
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.submit(request, chain=LEAVE_DEFAULT)
        request.submitted_at = timezone.now()
        request.save(update_fields=["status", "current_level", "submitted_at", "updated_at"])

        # Hold the balance
        year = request.start_date.year
        BalanceService.hold_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )
        return request

    @staticmethod
    def act(
        request: LeaveRequest,
        actor: User,
        decision: Decision,
        comment: str = "",
    ) -> LeaveRequest:
        """Engine.act + balance update on terminal decisions."""
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.act(request, chain=LEAVE_DEFAULT, actor=actor, decision=decision, comment=comment)
        request.decided_at = timezone.now()
        request.decided_by = actor.id
        request.save(
            update_fields=["status", "current_level", "decided_at", "decided_by", "updated_at"]
        )

        if request.status == "approved":
            year = request.start_date.year
            BalanceService.deduct(
                org_id=request.org_id,
                employee_id=request.employee_id,
                leave_type=request.leave_type,
                year=year,
                days=request.total_days,
                reference_type="leave_request",
                reference_id=request.id,
                actor_id=actor.id,
            )
        elif request.status == "rejected":
            year = request.start_date.year
            BalanceService.release_pending(
                org_id=request.org_id,
                employee_id=request.employee_id,
                leave_type=request.leave_type,
                year=year,
                days=request.total_days,
            )
        return request

    @staticmethod
    def cancel(request: LeaveRequest, actor: User) -> LeaveRequest:
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.cancel(request, actor=actor)
        request.save(update_fields=["status", "updated_at"])

        # Release pending if it was holding
        year = request.start_date.year
        BalanceService.release_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )

        # Notify pending approver(s) that the request was cancelled (best-effort).
        try:
            from modules.identity.models import User as _User
            from modules.leave.models import LeaveApproval
            from modules.notification.services.notify import notify

            approver_ids = list(
                LeaveApproval.objects.filter(
                    leave_request=request, status="pending"
                ).values_list("approver_id", flat=True)
            )
            for appr in _User.objects.filter(id__in=approver_ids, is_active=True):
                notify(
                    user=appr,
                    type="leave.cancelled",
                    payload={"leave_request_id": str(request.id)},
                    deep_link="/leave/approvals",
                    priority="normal",
                )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to send leave.cancelled notification for leave %s", request.id
            )

        return request

    @staticmethod
    def withdraw(request: LeaveRequest, actor: User) -> LeaveRequest:
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.withdraw(request, actor=actor)
        request.save(update_fields=["status", "updated_at"])

        year = request.start_date.year
        BalanceService.release_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )
        return request
