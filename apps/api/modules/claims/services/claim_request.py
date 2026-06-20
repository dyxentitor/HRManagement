"""ClaimRequestService — submit/act/cancel/mark_reimbursed wrapping the workflow engine."""

from __future__ import annotations

from django.utils import timezone

from common.workflow import Decision, WorkflowEngine
from common.workflow.resolvers import FinanceResolver

from ..chains import select_chain
from ..models import ClaimRequest


def _is_user_on_approved_leave(user, on_date) -> bool:
    """Lookup used by workflow routing to detect manager-on-leave fallback."""
    from modules.leave.services.leave_request import is_user_on_approved_leave

    return is_user_on_approved_leave(user, on_date)


def _select_chain_for(claim: ClaimRequest):
    """Pick the approval chain for a claim, respecting the category policy override."""
    policy = claim.category.policies.filter(deleted_at__isnull=True).first()
    override = policy.approval_chain_code if policy else ""
    return select_chain(amount=claim.amount, override_code=override)


class ClaimRequestService:
    @staticmethod
    def submit(claim: ClaimRequest, actor) -> ClaimRequest:
        chain = _select_chain_for(claim)
        engine = WorkflowEngine(is_on_leave_lookup=_is_user_on_approved_leave)
        engine.submit(claim, chain=chain)
        claim.submitted_at = timezone.now()
        claim.save(update_fields=["status", "current_level", "submitted_at", "updated_at"])
        return claim

    @staticmethod
    def act(
        claim: ClaimRequest,
        actor,
        decision: Decision,
        comment: str = "",
    ) -> ClaimRequest:
        chain = _select_chain_for(claim)
        engine = WorkflowEngine(is_on_leave_lookup=_is_user_on_approved_leave)
        engine.act(claim, chain=chain, actor=actor, decision=decision, comment=comment)

        # Engine sets status = "approved" when final step is approved.
        # Map to our granular statuses: check if last step uses FinanceResolver.
        # NOTE: the engine requires status="submitted" to keep acting through the
        # chain, so we MUST NOT overwrite status mid-chain. The employee-facing
        # "manager approved" progress is derived on the client from current_level
        # (which the engine advances per approval).
        if claim.status == "approved":
            last_step = chain.get_step(chain.total_steps)
            if last_step is not None and isinstance(last_step.resolver, FinanceResolver):
                claim.status = "finance_approved"
            else:
                claim.status = "manager_approved"

        claim.save(update_fields=["status", "current_level", "updated_at"])
        return claim

    @staticmethod
    def cancel(claim: ClaimRequest, actor) -> ClaimRequest:
        engine = WorkflowEngine()
        engine.cancel(claim, actor=actor)
        claim.save(update_fields=["status", "updated_at"])
        return claim

    @staticmethod
    def mark_reimbursed(claim: ClaimRequest, *, reference: str, actor_id) -> ClaimRequest:
        if claim.status != "finance_approved":
            from common.workflow.exceptions import InvalidTransition

            raise InvalidTransition(f"Cannot mark reimbursed from status='{claim.status}'")
        claim.status = "reimbursed"
        claim.reimbursed_at = timezone.now()
        claim.reimbursement_reference = reference
        claim.save(
            update_fields=[
                "status",
                "reimbursed_at",
                "reimbursement_reference",
                "updated_at",
            ]
        )
        return claim
