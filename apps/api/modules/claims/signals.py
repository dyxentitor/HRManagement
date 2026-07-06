"""Signal handlers -- populate ClaimApproval rows on workflow events."""

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

from .models import ClaimApproval, ClaimRequest

_log = logging.getLogger(__name__)


def _notify_for_claim(
    user, notif_type: str, subject: ClaimRequest, priority: str = "normal"
) -> None:
    """Best-effort notify() call -- errors must not break the workflow."""
    try:
        from modules.notification.services.notify import notify

        notify(
            user=user,
            type=notif_type,
            payload={"claim_request_id": str(subject.id)},
            deep_link="/claims/me",
            priority=priority,
        )
    except Exception:
        _log.exception("Failed to send %s notification for claim %s", notif_type, subject.id)


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
    # Notify the approver about the submission (action required)
    _notify_for_claim(approver, "claim.submitted", subject, priority="high")


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


@receiver(workflow_approved)
def _on_approved(sender, subject, chain, **kwargs):
    """Terminal approval -- notify the requester."""
    if not isinstance(subject, ClaimRequest):
        return
    emp_user = getattr(subject.employee, "user", None)
    if emp_user is not None:
        _notify_for_claim(emp_user, "claim.approved", subject)


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


@receiver(workflow_rejected)
def _on_rejected(sender, subject, chain, actor, comment, **kwargs):
    """Rejection -- notify the requester."""
    if not isinstance(subject, ClaimRequest):
        return
    emp_user = getattr(subject.employee, "user", None)
    if emp_user is not None:
        _notify_for_claim(emp_user, "claim.rejected", subject)
