"""Pre-configured claim workflow chains, selected by amount or category override."""

from decimal import Decimal

from common.workflow import (
    ApprovalStep,
    DepartmentHeadResolver,
    DirectManagerResolver,
    FinanceResolver,
    RoleResolver,
    RoutingKind,
    WorkflowChain,
)

# Per-stage authorization (v1.57.0): routing = who is targeted, required_permission
# = the capability that gates the action. Manager/dept-head stay structural (routed
# to the requester's actual manager/head, who must hold claim:approve:team). Finance
# and the >5000 HR step are permission pools on claim:approve:finance (any holder acts;
# the "already acted" guard enforces separation of duties across the two pool steps).
_MANAGER = dict(routing=RoutingKind.DIRECT_MANAGER, required_permission="claim:approve:team")


def _MANAGER_RESOLVER() -> DirectManagerResolver:  # noqa: N802 - reads as a constant factory
    """Level-1 resolver for every claim chain.

    ``allow_self_approval=True`` lets a requester holding the ``manager`` role
    clear their own level-1 stage when nobody sits above them. Without it,
    ``engine.submit`` raises ``NoApproverFound`` and a top-of-chain manager
    cannot file a claim at all. Finance remains a mandatory later stage in all
    three chains, so this advances the claim — it never pays it out.
    Deliberately NOT enabled for leave (single-step chain, no later gate).
    """
    return DirectManagerResolver(allow_self_approval=True)
_DEPT_HEAD = dict(routing=RoutingKind.DEPARTMENT_HEAD, required_permission="claim:approve:team")
_FINANCE_POOL = dict(routing=RoutingKind.PERMISSION_POOL, required_permission="claim:approve:finance")

CLAIM_UNDER_500 = WorkflowChain(
    code="claim_under_500",
    steps=[
        ApprovalStep(level=1, resolver=_MANAGER_RESOLVER(), **_MANAGER),
        ApprovalStep(level=2, resolver=FinanceResolver(), **_FINANCE_POOL),
    ],
)

CLAIM_500_TO_5000 = WorkflowChain(
    code="claim_500_to_5000",
    steps=[
        ApprovalStep(level=1, resolver=_MANAGER_RESOLVER(), **_MANAGER),
        ApprovalStep(level=2, resolver=DepartmentHeadResolver(), **_DEPT_HEAD),
        ApprovalStep(level=3, resolver=FinanceResolver(), **_FINANCE_POOL),
    ],
)

CLAIM_OVER_5000 = WorkflowChain(
    code="claim_over_5000",
    steps=[
        ApprovalStep(level=1, resolver=_MANAGER_RESOLVER(), **_MANAGER),
        ApprovalStep(level=2, resolver=DepartmentHeadResolver(), **_DEPT_HEAD),
        ApprovalStep(level=3, resolver=RoleResolver(role_code="hr_manager"), **_FINANCE_POOL),
        ApprovalStep(level=4, resolver=FinanceResolver(), **_FINANCE_POOL),
    ],
)


_CHAINS_BY_CODE = {
    "claim_under_500": CLAIM_UNDER_500,
    "claim_500_to_5000": CLAIM_500_TO_5000,
    "claim_over_5000": CLAIM_OVER_5000,
}


def select_chain(*, amount: Decimal, override_code: str = "") -> WorkflowChain:
    """Pick a chain. Override wins if code is in the registry; otherwise amount band:
    < 500   → CLAIM_UNDER_500
    < 5000  → CLAIM_500_TO_5000
    else    → CLAIM_OVER_5000
    """
    if override_code and override_code in _CHAINS_BY_CODE:
        return _CHAINS_BY_CODE[override_code]
    if amount < Decimal("500"):
        return CLAIM_UNDER_500
    if amount < Decimal("5000"):
        return CLAIM_500_TO_5000
    return CLAIM_OVER_5000
