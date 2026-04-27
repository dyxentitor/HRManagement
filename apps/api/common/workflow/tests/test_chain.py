"""ApprovalStep + WorkflowChain dataclasses."""

from common.workflow.chain import ApprovalStep, WorkflowChain
from common.workflow.resolvers import DirectManagerResolver, FinanceResolver, RoleResolver


def test_approvalstep_required_default_true() -> None:
    step = ApprovalStep(level=1, resolver=DirectManagerResolver())
    assert step.required is True
    assert step.deadline_hours is None


def test_workflowchain_holds_steps_in_level_order() -> None:
    chain = WorkflowChain(
        code="claim_under_500",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
        ],
    )
    assert chain.code == "claim_under_500"
    assert [s.level for s in chain.steps] == [1, 2]


def test_workflowchain_get_step_by_level() -> None:
    chain = WorkflowChain(
        code="x",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
        ],
    )
    assert chain.get_step(1).level == 1
    assert chain.get_step(2).level == 2
    assert chain.get_step(3) is None


def test_workflowchain_total_steps() -> None:
    chain = WorkflowChain(
        code="x",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
            ApprovalStep(level=3, resolver=RoleResolver("hr_manager")),
        ],
    )
    assert chain.total_steps == 3
