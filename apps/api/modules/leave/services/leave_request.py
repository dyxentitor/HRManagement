"""LeaveRequestService — submit/approve/reject/cancel/withdraw, balance integration."""

from __future__ import annotations

import datetime

from django.utils import timezone

from common.workflow import (
    Decision,
    WorkflowEngine,
)
from modules.identity.models import User

from ..chains import LEAVE_DEFAULT
from ..models import LeaveRequest
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
    def submit(request: LeaveRequest, actor: User) -> LeaveRequest:
        """Engine.submit + hold balance pending."""
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
