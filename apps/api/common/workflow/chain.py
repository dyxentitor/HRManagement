"""ApprovalStep + WorkflowChain — declarative shape of an approval workflow."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from modules.identity.models import User


class ApproverResolver(Protocol):
    """Resolves the approver user for a given subject employee + request."""

    def resolve(self, subject_employee: Any, request: Any) -> User | None: ...


@dataclass(frozen=True)
class ApprovalStep:
    level: int
    resolver: ApproverResolver
    required: bool = True
    deadline_hours: int | None = None  # Phase 2: SLA / escalation


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
