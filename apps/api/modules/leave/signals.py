"""Leave-module signal handlers -- record approval rows on workflow events."""

from __future__ import annotations

import logging

from django.dispatch import receiver
from django.utils import timezone

from common.workflow import (
    workflow_approved,
    workflow_rejected,
    workflow_step_approved,
    workflow_step_rejected,
    workflow_submitted,
)

from .models import LeaveApproval, LeaveRequest

_log = logging.getLogger(__name__)


def _notify_for_leave(
    user, notif_type: str, subject: LeaveRequest, priority: str = "normal"
) -> None:
    """Best-effort notify() call -- errors must not break the workflow."""
    try:
        from modules.notification.services.notify import notify

        notify(
            user=user,
            type=notif_type,
            payload={"leave_request_id": str(subject.id)},
            deep_link="/leave/me",
            priority=priority,
        )
    except Exception:
        _log.exception("Failed to send %s notification for leave %s", notif_type, subject.id)


@receiver(workflow_submitted)
def _on_submitted(sender, subject, chain, **kwargs):
    """Create a pending LeaveApproval row at level 1 when a request is submitted."""
    if not isinstance(subject, LeaveRequest):
        return
    # Resolve the level-1 approver
    step = chain.get_step(1)
    if step is None:
        return
    approver = step.resolver.resolve(subject.employee, request=subject)
    if approver is None:
        return
    LeaveApproval.objects.create(
        leave_request=subject, level=1, approver_id=approver.id, status="pending"
    )
    # Notify the approver about the new submission (action required)
    _notify_for_leave(approver, "leave.submitted", subject, priority="high")


@receiver(workflow_step_approved)
def _on_step_approved(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, LeaveRequest):
        return
    LeaveApproval.objects.filter(leave_request=subject, level=level, status="pending").update(
        status="approved",
        acted_at=timezone.now(),
        comment=comment,
        approver_id=actor.id,
    )


@receiver(workflow_approved)
def _on_approved(sender, subject, chain, **kwargs):
    """Terminal approval -- notify the requester."""
    if not isinstance(subject, LeaveRequest):
        return
    try:
        emp_user = subject.employee.user
    except Exception:
        emp_user = None
    if emp_user is not None:
        _notify_for_leave(emp_user, "leave.approved", subject)


@receiver(workflow_step_rejected)
def _on_step_rejected(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, LeaveRequest):
        return
    LeaveApproval.objects.filter(leave_request=subject, level=level, status="pending").update(
        status="rejected",
        acted_at=timezone.now(),
        comment=comment,
        approver_id=actor.id,
    )


@receiver(workflow_rejected)
def _on_rejected(sender, subject, chain, actor, comment, **kwargs):
    """Rejection -- notify the requester."""
    if not isinstance(subject, LeaveRequest):
        return
    try:
        emp_user = subject.employee.user
    except Exception:
        emp_user = None
    if emp_user is not None:
        _notify_for_leave(emp_user, "leave.rejected", subject)
