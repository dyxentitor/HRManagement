"""Signal handlers — populate ClaimApproval rows on workflow events."""

from __future__ import annotations

from django.dispatch import receiver
from django.utils import timezone

from common.workflow import (
    workflow_step_approved,
    workflow_step_rejected,
    workflow_submitted,
)

from .models import ClaimApproval, ClaimRequest


@receiver(workflow_submitted)
def _on_submitted(sender, subject, chain, **kwargs):
    if not isinstance(subject, ClaimRequest):
        return
    step = chain.get_step(1)
    if step is None:
        return
    approver = step.resolver.resolve(subject.employee, request=subject)
    if approver is None:
        return
    ClaimApproval.objects.create(
        claim=subject,
        level=1,
        approver_id=approver.id,
        status="pending",
    )


@receiver(workflow_step_approved)
def _on_step_approved(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, ClaimRequest):
        return
    ClaimApproval.objects.filter(
        claim=subject,
        level=level,
        status="pending",
    ).update(
        status="approved",
        acted_at=timezone.now(),
        comment=comment,
        approver_id=actor.id,
    )
    # Stage next pending approval row if more steps follow
    next_level = level + 1
    next_step = chain.get_step(next_level)
    if next_step is None:
        return
    next_approver = next_step.resolver.resolve(subject.employee, request=subject)
    if next_approver is None:
        return
    ClaimApproval.objects.create(
        claim=subject,
        level=next_level,
        approver_id=next_approver.id,
        status="pending",
    )


@receiver(workflow_step_rejected)
def _on_step_rejected(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, ClaimRequest):
        return
    ClaimApproval.objects.filter(
        claim=subject,
        level=level,
        status="pending",
    ).update(
        status="rejected",
        acted_at=timezone.now(),
        comment=comment,
        approver_id=actor.id,
    )
