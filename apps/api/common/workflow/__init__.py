"""Public surface for the workflow engine.

All symbols are importable from common.workflow directly, e.g.:
    from common.workflow import WorkflowEngine, Decision, DelegationService
"""

from __future__ import annotations

# Re-exports are lazy to avoid AppRegistryNotReady during Django startup.
# Use TYPE_CHECKING guards in consumer modules when you only need the type.


def __getattr__(name: str):
    _public = {
        # chain
        "ApprovalStep",
        "ApproverResolver",
        "RoutingKind",
        "WorkflowChain",
        # authorization
        "StageAuthorizer",
        # engine
        "Decision",
        "WorkflowEngine",
        "WorkflowSubject",
        "workflow_approved",
        "workflow_cancelled",
        "workflow_rejected",
        "workflow_step_approved",
        "workflow_step_rejected",
        "workflow_submitted",
        "workflow_withdrawn",
        # exceptions
        "InvalidTransition",
        "NoApproverFound",
        "NotAuthorizedToAct",
        "WorkflowError",
        # resolvers
        "DepartmentHeadResolver",
        "DirectManagerResolver",
        "FallbackResolver",
        "FinanceResolver",
        "RoleResolver",
        # routing
        "get_effective_approver",
        # service
        "DelegationService",
    }
    if name not in _public:
        raise AttributeError(f"module 'common.workflow' has no attribute {name!r}")

    if name in {"ApprovalStep", "ApproverResolver", "RoutingKind", "WorkflowChain"}:
        from .chain import ApprovalStep, ApproverResolver, RoutingKind, WorkflowChain

        _map = {
            "ApprovalStep": ApprovalStep,
            "ApproverResolver": ApproverResolver,
            "RoutingKind": RoutingKind,
            "WorkflowChain": WorkflowChain,
        }
    elif name == "StageAuthorizer":
        from .authorization import StageAuthorizer

        _map = {"StageAuthorizer": StageAuthorizer}
    elif name in {
        "Decision",
        "WorkflowEngine",
        "WorkflowSubject",
        "workflow_approved",
        "workflow_cancelled",
        "workflow_rejected",
        "workflow_step_approved",
        "workflow_step_rejected",
        "workflow_submitted",
        "workflow_withdrawn",
    }:
        from .engine import (
            Decision,
            WorkflowEngine,
            WorkflowSubject,
            workflow_approved,
            workflow_cancelled,
            workflow_rejected,
            workflow_step_approved,
            workflow_step_rejected,
            workflow_submitted,
            workflow_withdrawn,
        )

        _map = {
            "Decision": Decision,
            "WorkflowEngine": WorkflowEngine,
            "WorkflowSubject": WorkflowSubject,
            "workflow_approved": workflow_approved,
            "workflow_cancelled": workflow_cancelled,
            "workflow_rejected": workflow_rejected,
            "workflow_step_approved": workflow_step_approved,
            "workflow_step_rejected": workflow_step_rejected,
            "workflow_submitted": workflow_submitted,
            "workflow_withdrawn": workflow_withdrawn,
        }
    elif name in {"InvalidTransition", "NoApproverFound", "NotAuthorizedToAct", "WorkflowError"}:
        from .exceptions import (
            InvalidTransition,
            NoApproverFound,
            NotAuthorizedToAct,
            WorkflowError,
        )

        _map = {
            "InvalidTransition": InvalidTransition,
            "NoApproverFound": NoApproverFound,
            "NotAuthorizedToAct": NotAuthorizedToAct,
            "WorkflowError": WorkflowError,
        }
    elif name in {
        "DepartmentHeadResolver",
        "DirectManagerResolver",
        "FallbackResolver",
        "FinanceResolver",
        "RoleResolver",
    }:
        from .resolvers import (
            DepartmentHeadResolver,
            DirectManagerResolver,
            FallbackResolver,
            FinanceResolver,
            RoleResolver,
        )

        _map = {
            "DepartmentHeadResolver": DepartmentHeadResolver,
            "DirectManagerResolver": DirectManagerResolver,
            "FallbackResolver": FallbackResolver,
            "FinanceResolver": FinanceResolver,
            "RoleResolver": RoleResolver,
        }
    elif name == "get_effective_approver":
        from .routing import get_effective_approver

        _map = {"get_effective_approver": get_effective_approver}
    elif name == "DelegationService":
        from .service import DelegationService

        _map = {"DelegationService": DelegationService}
    else:
        raise AttributeError(f"module 'common.workflow' has no attribute {name!r}")

    return _map[name]


__all__ = [
    "ApprovalStep",
    "ApproverResolver",
    "Decision",
    "DelegationService",
    "DepartmentHeadResolver",
    "DirectManagerResolver",
    "FallbackResolver",
    "FinanceResolver",
    "InvalidTransition",
    "NoApproverFound",
    "NotAuthorizedToAct",
    "RoleResolver",
    "RoutingKind",
    "StageAuthorizer",
    "WorkflowChain",
    "WorkflowEngine",
    "WorkflowError",
    "WorkflowSubject",
    "get_effective_approver",
    "workflow_approved",
    "workflow_cancelled",
    "workflow_rejected",
    "workflow_step_approved",
    "workflow_step_rejected",
    "workflow_submitted",
    "workflow_withdrawn",
]
