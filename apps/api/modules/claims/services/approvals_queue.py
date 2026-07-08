"""Claims Approvals workspace — list + KPI summary for an approver."""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from django.utils import timezone

from common.workflow.chain import RoutingKind
from modules.claims.chains import select_chain
from modules.claims.models import ClaimApproval, ClaimRequest
from modules.claims.services.approver_scope import actionable_claim_ids

if TYPE_CHECKING:
    from modules.identity.models import User

HIGH_VALUE = Decimal("5000")
OVERDUE_DAYS = 3

_STAGE_LABELS = {
    RoutingKind.DIRECT_MANAGER: "Manager",
    RoutingKind.DEPARTMENT_HEAD: "Dept head",
    RoutingKind.PERMISSION_POOL: "Finance",
}


def _stage_label(claim: ClaimRequest) -> str:
    policy = claim.category.policies.filter(deleted_at__isnull=True).first()
    chain = select_chain(
        amount=claim.amount, override_code=policy.approval_chain_code if policy else ""
    )
    step = chain.get_step(claim.current_level)
    if step is None or step.routing is None:
        return "—"
    return _STAGE_LABELS.get(step.routing, "—")


def _age_days(claim: ClaimRequest) -> int:
    if claim.submitted_at is None:
        return 0
    return (timezone.now().date() - claim.submitted_at.date()).days


def _row(claim: ClaimRequest, actionable: set) -> dict:
    is_await = claim.id in actionable
    age = _age_days(claim)
    return {
        "id": str(claim.id),
        "employee_name": claim.employee.full_name,
        "employee_role_title": claim.employee.role_title,
        "employee_code": claim.employee.employee_code,
        "amount": str(claim.amount),
        "currency_code": claim.currency_code,
        "category_name": claim.category.name,
        "merchant": claim.merchant,
        "submitted_at": claim.submitted_at.isoformat() if claim.submitted_at else None,
        "status": claim.status,
        "stage_label": _stage_label(claim),
        "attachments_count": claim.attachments.count(),
        "is_high_value": claim.amount >= HIGH_VALUE,
        "age_days": age,
        "is_overdue": is_await and age > OVERDUE_DAYS,
        "actionable": is_await,
    }


def list_for_approver(user: User, tab: str) -> list[dict]:
    actionable = actionable_claim_ids(user)
    if tab == "awaiting":
        ids = actionable
    elif tab in ("approved", "rejected"):
        ids = set(
            ClaimApproval.objects.filter(approver_id=user.id, status=tab).values_list(
                "claim_id", flat=True
            )
        )
    else:  # all
        ids = actionable | set(
            ClaimApproval.objects.filter(
                approver_id=user.id, status__in=("approved", "rejected")
            ).values_list("claim_id", flat=True)
        )
    qs = (
        ClaimRequest.all_objects.filter(id__in=ids, org_id=user.org_id, deleted_at__isnull=True)
        .select_related("employee__department", "category")
        .prefetch_related("attachments", "category__policies")
    )
    rows = [_row(c, actionable) for c in qs]
    # Urgency first: overdue before not-overdue, then oldest first.
    rows.sort(key=lambda r: (not r["is_overdue"], -r["age_days"]))
    return rows


def summary_for_approver(user: User) -> dict:
    actionable = actionable_claim_ids(user)
    aw = list(
        ClaimRequest.all_objects.filter(
            id__in=actionable, org_id=user.org_id, deleted_at__isnull=True
        )
    )
    pending_value = sum((c.amount for c in aw), Decimal("0"))
    ages = [_age_days(c) for c in aw if c.submitted_at is not None]
    since = timezone.now() - datetime.timedelta(days=7)
    return {
        "awaiting_count": len(aw),
        "pending_value": str(pending_value),
        "oldest_days": max(ages) if ages else 0,
        "overdue_count": sum(1 for a in ages if a > OVERDUE_DAYS),
        "high_value_count": sum(1 for c in aw if c.amount >= HIGH_VALUE),
        "approved_this_week": ClaimApproval.objects.filter(
            approver_id=user.id, status="approved", acted_at__gte=since
        ).count(),
    }
