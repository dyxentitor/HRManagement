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
    user,
    notif_type: str,
    subject: LeaveRequest,
    priority: str = "normal",
    cc_context: dict | None = None,
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
            cc_context=cc_context or {},
        )
    except Exception:
        _log.exception("Failed to send %s notification for leave %s", notif_type, subject.id)


def _final_approver_id(subject: LeaveRequest):
    """The approver who granted terminal approval, as a string, or None.

    workflow_approved carries no actor, so recover it from the approval trail.
    Best-effort like the notify() call it feeds: a lookup failure must never
    propagate into the workflow transaction.
    """
    try:
        appr = (
            LeaveApproval.objects.filter(leave_request=subject, status="approved")
            .order_by("-acted_at")
            .first()
        )
    except Exception:
        _log.exception("Failed to resolve final approver for leave %s", subject.id)
        return None
    return str(appr.approver_id) if appr and appr.approver_id else None


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
    requester = getattr(subject.employee, "user", None)
    cc_context = {"requester": str(requester.id)} if requester is not None else {}
    _notify_for_leave(approver, "leave.submitted", subject, priority="high", cc_context=cc_context)


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
        approver_id = _final_approver_id(subject)
        cc_context = {"approver": approver_id} if approver_id else {}
        _notify_for_leave(emp_user, "leave.approved", subject, cc_context=cc_context)


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
        cc_context = {"approver": str(actor.id)} if actor is not None else {}
        _notify_for_leave(emp_user, "leave.rejected", subject, cc_context=cc_context)
