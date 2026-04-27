"""Leave-module signal handlers — record approval rows on workflow events."""

from __future__ import annotations

from django.dispatch import receiver
from django.utils import timezone

from common.workflow import (
    workflow_step_approved,
    workflow_step_rejected,
    workflow_submitted,
)

from .models import LeaveApproval, LeaveRequest


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
