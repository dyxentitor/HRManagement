"""Pre-configured leave workflow chains."""

from common.workflow import (
    ApprovalStep,
    DepartmentHeadResolver,
    DirectManagerResolver,
    FallbackResolver,
    RoleResolver,
    WorkflowChain,
)

# 1-step chain with resolver waterfall:
#   1. Direct manager (the normal case)
#   2. Department head (if employee has no direct manager)
#   3. Anyone holding the `hr_manager` role (last-resort escalation)
#
# Spec decision #16: "Single direct manager via OrgService abstraction +
# departments.head_employee_id for HR escalations." This chain implements that
# fallback so leave requests don't 500 when an employee is missing a manager.
LEAVE_DEFAULT = WorkflowChain(
    code="leave_default",
    steps=[
        ApprovalStep(
            level=1,
            resolver=FallbackResolver(
                DirectManagerResolver(),
                DepartmentHeadResolver(),
                RoleResolver("hr_manager"),
            ),
        ),
    ],
)
