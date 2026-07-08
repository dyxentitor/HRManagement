"""WorkflowEngine — subject-agnostic state machine for multi-step approvals.

Subjects (LeaveRequest, ClaimRequest, etc.) implement the WorkflowSubject
Protocol — the engine reads/writes `status` + `current_level` on them.
Domain events (Submitted/Approved/Rejected/etc.) are emitted as Django
signals so feature modules can react.
"""

from __future__ import annotations

import datetime
import enum
from typing import Any, Protocol

from django.dispatch import Signal

from modules.identity.models import User

from .chain import WorkflowChain
from .exceptions import (
    InvalidTransition,
    NoApproverFound,
    NotAuthorizedToAct,
)
from .routing import get_effective_approver

# --- Signals ---
workflow_submitted = Signal()  # subject, chain
workflow_step_approved = Signal()  # subject, chain, level, actor, comment
workflow_step_rejected = Signal()  # subject, chain, level, actor, comment
workflow_approved = Signal()  # subject, chain
workflow_rejected = Signal()  # subject, chain, actor, comment
workflow_cancelled = Signal()  # subject, actor
workflow_withdrawn = Signal()  # subject, actor


class Decision(enum.Enum):
    APPROVE = "approve"
    REJECT = "reject"


class WorkflowSubject(Protocol):
    """Duck-typed subject. Engine reads/writes `status` and `current_level` on it.

    Required attributes:
      - status: str  # 'draft'|'submitted'|'approved'|'rejected'|'cancelled'|'withdrawn'
      - current_level: int (0 when draft; 1+ once submitted)
      - employee: Employee-like object with .id
    """

    status: str
    current_level: int
    employee: Any


def _is_on_leave_default(user: User, on_date: datetime.date) -> bool:
    """Default leave-fallback lookup: not on leave.

    The leave module overrides this by passing its own callable when constructing
    the engine, e.g.:

        engine = WorkflowEngine(is_on_leave_lookup=leave_service.is_on_approved_leave)
    """
    return False


class WorkflowEngine:
    """Drives a subject through its approval chain.

    The engine does NOT persist anything itself — it mutates the subject in
    place and emits signals. Callers are responsible for saving and for
    inserting per-module approval rows (leave_approvals, claim_approvals).
    """

    def __init__(self, is_on_leave_lookup=None) -> None:
        self.is_on_leave_lookup = is_on_leave_lookup or _is_on_leave_default

    # --- transitions ---

    def submit(self, subject: WorkflowSubject, chain: WorkflowChain) -> None:
        if subject.status != "draft":
            raise InvalidTransition(f"Cannot submit from status='{subject.status}'")

        first_step = chain.get_step(1)
        if first_step is None:
            raise InvalidTransition(f"Chain '{chain.code}' has no level 1 step")

        approver = self._resolve_step(subject, chain, level=1)
        if approver is None:
            raise NoApproverFound(f"No approver found for chain={chain.code} level=1")

        subject.status = "submitted"
        subject.current_level = 1
        workflow_submitted.send(sender=self.__class__, subject=subject, chain=chain)

    def act(
        self,
        subject: WorkflowSubject,
        chain: WorkflowChain,
        actor: User,
        decision: Decision,
        comment: str = "",
        authorizer: Any = None,
    ) -> None:
        if subject.status != "submitted":
            raise InvalidTransition(f"Cannot act on status='{subject.status}'")

        # Defence-in-depth: even if a resolver picks the requester themselves
        # (data drift, edge-case fixture), refuse self-approval here.
        requester_user_id = getattr(getattr(subject, "employee", None), "user_id", None)
        if requester_user_id is not None and actor.id == requester_user_id:
            raise NotAuthorizedToAct(
                f"User {actor.id} cannot approve their own request "
                f"(chain={chain.code} level={subject.current_level})"
            )

        step = chain.get_step(subject.current_level)
        if step is not None and step.routing is not None and authorizer is not None:
            # Permission-driven authorization (claims). Structural stages verify the
            # routed target inside the authorizer; pool stages accept any holder.
            authorizer.authorize(
                step,
                actor,
                subject,
                resolve_target=lambda: self._resolve_step(
                    subject, chain, level=subject.current_level
                ),
            )
        else:
            # Legacy identity-match path (leave, and any step without routing).
            expected_approver = self._resolve_step(subject, chain, level=subject.current_level)
            if expected_approver is None:
                raise NoApproverFound(
                    f"No approver found for chain={chain.code} level={subject.current_level}"
                )
            if expected_approver.id != actor.id:
                raise NotAuthorizedToAct(
                    f"User {actor.id} is not the resolved approver ({expected_approver.id}) "
                    f"for chain={chain.code} level={subject.current_level}"
                )

        if decision == Decision.REJECT:
            subject.status = "rejected"
            workflow_step_rejected.send(
                sender=self.__class__,
                subject=subject,
                chain=chain,
                level=subject.current_level,
                actor=actor,
                comment=comment,
            )
            workflow_rejected.send(
                sender=self.__class__,
                subject=subject,
                chain=chain,
                actor=actor,
                comment=comment,
            )
            return

        # APPROVE — advance, auto-skipping consecutive stages the SAME actor may act
        # on (e.g. a manager who is also the department head). This collapses a
        # single approval action across every stage routed to the same authorized
        # person, so one click advances to the next *different* approver. Each stage
        # still fires its own step-approved signal (ClaimApproval rows, notifications,
        # audit) atomically. Only runs when an authorizer is provided (claims); the
        # legacy path (leave) advances exactly one stage as before.
        while True:
            approved_step = chain.get_step(subject.current_level)
            workflow_step_approved.send(
                sender=self.__class__,
                subject=subject,
                chain=chain,
                level=subject.current_level,
                actor=actor,
                comment=comment,
            )
            next_level = subject.current_level + 1
            if next_level > chain.total_steps:
                subject.status = "approved"
                workflow_approved.send(sender=self.__class__, subject=subject, chain=chain)
                return

            subject.current_level = next_level

            if authorizer is None:
                return
            next_step = chain.get_step(next_level)
            if next_step is None or next_step.routing is None:
                return
            # Only collapse stages of the SAME functional tier (same required
            # permission) — so a manager's approval covers Manager + Dept-Head but
            # never auto-performs a different-tier stage (e.g. Finance): the claim
            # lands in the Finance queue for an explicit finance approval.
            if approved_step is None or next_step.required_permission != approved_step.required_permission:
                return
            if not authorizer.can_act(
                next_step,
                actor,
                subject,
                resolve_target=lambda lvl=next_level: self._resolve_step(subject, chain, lvl),
            ):
                return
            # Same tier + same authorized actor — loop to auto-approve the next stage.

    def cancel(self, subject: WorkflowSubject, actor: User) -> None:
        if subject.status not in {"draft", "submitted"}:
            raise InvalidTransition(f"Cannot cancel from status='{subject.status}'")
        subject.status = "cancelled"
        workflow_cancelled.send(sender=self.__class__, subject=subject, actor=actor)

    def withdraw(self, subject: WorkflowSubject, actor: User) -> None:
        """Withdraw is the requester's pre-approval cancel. State-wise same as cancel
        but emits a different signal so notifications can differ.
        """
        if subject.status != "submitted":
            raise InvalidTransition(f"Cannot withdraw from status='{subject.status}'")
        subject.status = "withdrawn"
        workflow_withdrawn.send(sender=self.__class__, subject=subject, actor=actor)

    # --- helpers ---

    def _resolve_step(
        self,
        subject: WorkflowSubject,
        chain: WorkflowChain,
        level: int,
    ) -> User | None:
        step = chain.get_step(level)
        if step is None:
            return None
        candidate = step.resolver.resolve(subject.employee, request=subject)
        return get_effective_approver(
            candidate=candidate,
            scope=self._scope_for_chain(chain),
            on_date=datetime.date.today(),
            is_on_leave_lookup=self.is_on_leave_lookup,
        )

    @staticmethod
    def _scope_for_chain(chain: WorkflowChain) -> str:
        # Chain codes prefixed with 'leave_' are leave-scope; 'claim_' are claim-scope.
        if chain.code.startswith("leave"):
            return "leave"
        if chain.code.startswith("claim"):
            return "claim"
        return "all"
