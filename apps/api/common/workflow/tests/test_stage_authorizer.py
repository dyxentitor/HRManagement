"""Unit tests for StageAuthorizer — authorization in isolation (no DB)."""

from __future__ import annotations

import uuid

import pytest

from common.workflow.authorization import StageAuthorizer
from common.workflow.chain import ApprovalStep, RoutingKind
from common.workflow.exceptions import NoApproverFound, NotAuthorizedToAct


class _Dummy:
    def __init__(self, uid):
        self.id = uid


class _Resolver:
    def resolve(self, subject_employee, request):  # pragma: no cover - not used here
        return None


def _step(routing, perm, level=1):
    return ApprovalStep(level=level, resolver=_Resolver(), routing=routing, required_permission=perm)


@pytest.fixture
def patch_perms(monkeypatch):
    def _set(perms):
        monkeypatch.setattr(
            "modules.identity.services.permissions.get_user_perms",
            lambda actor: frozenset(perms),
        )

    return _set


OVERRIDE = "claim:approve:override"


def test_structural_allows_resolved_target_with_perm(patch_perms):
    patch_perms({"claim:approve:team"})
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.DIRECT_MANAGER, "claim:approve:team")
    auth.authorize(step, actor, subject=None, resolve_target=lambda: actor)  # no raise


def test_structural_denies_non_target(patch_perms):
    patch_perms({"claim:approve:team"})
    actor = _Dummy(uuid.uuid4())
    target = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.DIRECT_MANAGER, "claim:approve:team")
    with pytest.raises(NotAuthorizedToAct):
        auth.authorize(step, actor, subject=None, resolve_target=lambda: target)


def test_structural_denies_target_lacking_perm(patch_perms):
    patch_perms(set())  # is the target, but has no permission
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.DIRECT_MANAGER, "claim:approve:team")
    with pytest.raises(NotAuthorizedToAct):
        auth.authorize(step, actor, subject=None, resolve_target=lambda: actor)


def test_structural_no_target_raises_no_approver(patch_perms):
    patch_perms({"claim:approve:team"})
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.DIRECT_MANAGER, "claim:approve:team")
    with pytest.raises(NoApproverFound):
        auth.authorize(step, actor, subject=None, resolve_target=lambda: None)


def test_pool_allows_any_holder(patch_perms):
    patch_perms({"claim:approve:finance"})
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.PERMISSION_POOL, "claim:approve:finance")
    auth.authorize(step, actor, subject=None, resolve_target=lambda: None)  # no raise


def test_pool_denies_non_holder(patch_perms):
    patch_perms({"claim:approve:team"})
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.PERMISSION_POOL, "claim:approve:finance")
    with pytest.raises(NotAuthorizedToAct):
        auth.authorize(step, actor, subject=None, resolve_target=lambda: None)


def test_pool_denies_already_acted(patch_perms):
    patch_perms({"claim:approve:finance"})
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE, prior_actor_ids={actor.id})
    step = _step(RoutingKind.PERMISSION_POOL, "claim:approve:finance")
    with pytest.raises(NotAuthorizedToAct):
        auth.authorize(step, actor, subject=None, resolve_target=lambda: None)


def test_override_holder_allowed_on_any_stage(patch_perms):
    patch_perms({OVERRIDE})  # no stage perm, not the target — override still wins
    actor = _Dummy(uuid.uuid4())
    auth = StageAuthorizer(override_permission=OVERRIDE)
    step = _step(RoutingKind.PERMISSION_POOL, "claim:approve:finance")
    auth.authorize(step, actor, subject=None, resolve_target=lambda: None)  # no raise
    step2 = _step(RoutingKind.DIRECT_MANAGER, "claim:approve:team")
    auth.authorize(step2, actor, subject=None, resolve_target=lambda: _Dummy(uuid.uuid4()))
