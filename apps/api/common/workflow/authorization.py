"""StageAuthorizer — the single place that decides who may act on an approval step.

Kept separate from the WorkflowEngine (which owns execution/state) so authorization
is testable in isolation. Only steps that opt in (via ``ApprovalStep.routing``) use
this; steps without routing keep the engine's legacy identity-match.

Rules (in order):
  1. Override: actor holds ``override_permission`` → allowed (break-glass; audit upstream).
  2. Structural (DIRECT_MANAGER / DEPARTMENT_HEAD): actor is the resolved target AND
     holds the step's ``required_permission``.
  3. Pool (PERMISSION_POOL): actor holds ``required_permission``.

A single multi-role person (e.g. manager + finance in a small business) may act at
consecutive stages — the model does not enforce segregation of duties (that's an org
policy expressed by assigning different people). Re-approving a *completed* stage is
impossible because acting advances the level. First-action-wins on a pool stage is
enforced by the caller's row lock + level advance. The self-approval guard (requester
may never approve their own request) lives in the engine, before this authorizer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

from .chain import RoutingKind
from .exceptions import NoApproverFound, NotAuthorizedToAct

if TYPE_CHECKING:
    from modules.identity.models import User

    from .chain import ApprovalStep


class StageAuthorizer:
    def __init__(self, *, override_permission: str) -> None:
        self.override_permission = override_permission

    def can_act(
        self, step: ApprovalStep, actor: User, subject: Any, resolve_target: Callable[[], User | None]
    ) -> bool:
        try:
            self.authorize(step, actor, subject, resolve_target)
            return True
        except (NotAuthorizedToAct, NoApproverFound):
            return False

    def authorize(
        self,
        step: ApprovalStep,
        actor: User,
        subject: Any,
        resolve_target: Callable[[], User | None],
    ) -> None:
        from modules.identity.services.permissions import get_user_perms

        perms = get_user_perms(actor)

        # 1. Break-glass override.
        if self.override_permission in perms:
            return

        # 2. Structural routing — must be the routed person AND hold the permission.
        if step.routing in (RoutingKind.DIRECT_MANAGER, RoutingKind.DEPARTMENT_HEAD):
            target = resolve_target()
            if target is None:
                raise NoApproverFound(f"No approver resolved for level {step.level}")
            if actor.id != target.id:
                raise NotAuthorizedToAct(
                    f"User {actor.id} is not the routed approver ({target.id}) for level {step.level}"
                )
            if step.required_permission and step.required_permission not in perms:
                raise NotAuthorizedToAct(
                    f"User {actor.id} lacks {step.required_permission} for level {step.level}"
                )
            return

        # 3. Permission pool — any holder of the required permission may act.
        if step.routing == RoutingKind.PERMISSION_POOL:
            if not step.required_permission or step.required_permission not in perms:
                raise NotAuthorizedToAct(
                    f"User {actor.id} lacks {step.required_permission} for pool level {step.level}"
                )
            return

        raise NotAuthorizedToAct(f"Step level {step.level} has no routing configured")
