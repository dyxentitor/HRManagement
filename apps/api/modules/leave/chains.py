"""Pre-configured leave workflow chains."""

from common.workflow import ApprovalStep, DirectManagerResolver, WorkflowChain

# 1-step chain: leave goes straight to direct manager.
LEAVE_DEFAULT = WorkflowChain(
    code="leave_default",
    steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())],
)
