"""Which claims a user can currently act on as an approver.

Shared by the approvals inbox and the Claims Approvals workspace so the
structural + permission-pool authorization logic lives in one place.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from modules.claims.models import ClaimApproval, ClaimRequest

if TYPE_CHECKING:
    from modules.identity.models import User


def actionable_claim_ids(user: User) -> set:
    """Claim ids the user may act on right now.

    Union of:
      - structural: a pending ClaimApproval row assigned to the user, and
      - pool: a submitted claim whose current chain step is a PERMISSION_POOL
        the user holds the required permission for.
    Excludes the user's own claims.
    """
    from common.workflow.chain import RoutingKind
    from modules.claims.chains import select_chain
    from modules.identity.services.permissions import get_user_perms

    ids: set = set(
        ClaimApproval.objects.filter(approver_id=user.id, status="pending").values_list(
            "claim_id", flat=True
        )
    )

    perms = get_user_perms(user)
    candidates = (
        ClaimRequest.all_objects.filter(
            org_id=user.org_id, status="submitted", deleted_at__isnull=True
        )
        .select_related("employee", "category")
        .prefetch_related("category__policies")
    )
    for claim in candidates:
        if claim.employee.user_id == user.id:  # never your own claim
            continue
        policy = claim.category.policies.filter(deleted_at__isnull=True).first()
        chain = select_chain(
            amount=claim.amount, override_code=policy.approval_chain_code if policy else ""
        )
        step = chain.get_step(claim.current_level)
        if (
            step is not None
            and step.routing == RoutingKind.PERMISSION_POOL
            and step.required_permission
            and step.required_permission in perms
        ):
            ids.add(claim.id)
    return ids
