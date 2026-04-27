"""Pre-configured claim workflow chains, selected by amount or category override."""

from decimal import Decimal

from common.workflow import (
    ApprovalStep,
    DepartmentHeadResolver,
    DirectManagerResolver,
    FinanceResolver,
    RoleResolver,
    WorkflowChain,
)

CLAIM_UNDER_500 = WorkflowChain(
    code="claim_under_500",
    steps=[
        ApprovalStep(level=1, resolver=DirectManagerResolver()),
        ApprovalStep(level=2, resolver=FinanceResolver()),
    ],
)

CLAIM_500_TO_5000 = WorkflowChain(
    code="claim_500_to_5000",
    steps=[
        ApprovalStep(level=1, resolver=DirectManagerResolver()),
        ApprovalStep(level=2, resolver=DepartmentHeadResolver()),
        ApprovalStep(level=3, resolver=FinanceResolver()),
    ],
)

CLAIM_OVER_5000 = WorkflowChain(
    code="claim_over_5000",
    steps=[
        ApprovalStep(level=1, resolver=DirectManagerResolver()),
        ApprovalStep(level=2, resolver=DepartmentHeadResolver()),
        ApprovalStep(level=3, resolver=RoleResolver(role_code="hr_manager")),
        ApprovalStep(level=4, resolver=FinanceResolver()),
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
