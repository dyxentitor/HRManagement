"""ApprovalStep + WorkflowChain — declarative shape of an approval workflow."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from modules.identity.models import User


class RoutingKind(str, enum.Enum):
    """How a step targets its approver(s).

    - DIRECT_MANAGER / DEPARTMENT_HEAD: structural — routed to the requester's
      specific manager/dept-head (via the resolver); that person must also hold
      the step's ``required_permission``.
    - PERMISSION_POOL: functional — any org user holding ``required_permission``
      may act (first valid action wins); the resolver is used only to pick a
      representative to notify.
    """

    DIRECT_MANAGER = "direct_manager"
    DEPARTMENT_HEAD = "department_head"
    PERMISSION_POOL = "permission_pool"


class ApproverResolver(Protocol):
    """Resolves the approver user for a given subject employee + request."""

    def resolve(self, subject_employee: Any, request: Any) -> User | None: ...


@dataclass(frozen=True)
class ApprovalStep:
    level: int
    resolver: ApproverResolver
    required: bool = True
    deadline_hours: int | None = None  # Phase 2: SLA / escalation
    # Permission-driven authorization (opt-in; leave steps leave these None and
    # keep the engine's legacy identity-match). See common/workflow/authorization.
    routing: RoutingKind | None = None
    required_permission: str | None = None


@dataclass(frozen=True)
class WorkflowChain:
    """Named sequence of approval steps. Reusable across feature modules."""

    code: str
    steps: list[ApprovalStep] = field(default_factory=list)

    def get_step(self, level: int) -> ApprovalStep | None:
        for s in self.steps:
            if s.level == level:
                return s
        return None

    @property
    def total_steps(self) -> int:
        return len(self.steps)
