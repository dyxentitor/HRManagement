"""Built-in resolvers — direct manager, department head, role-based, finance.

Self-approval guard
-------------------

Every resolver below drops the requester themselves from the candidate
pool. Without this, a solo manager whose ``head_employee_id`` (or sole
``hr_manager`` role-holder) is themselves would get assigned as their
own approver, and the engine would happily accept their own ``approve``
call. This is closing v1.10.1 sweep Bug #2.

The requester user id is read from ``request.employee.user_id`` if the
caller passes a subject. Callers (tests/services) that pass
``request=None`` get the legacy behaviour — no exclusion — which keeps
existing tests stable.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from modules.identity.models import Role, User, UserRole
from modules.identity.services.org import OrgService


def _requester_user_id(request: Any) -> UUID | None:
    """Best-effort: return the requester user id from a workflow subject.

    The engine passes ``request=subject`` and subjects expose ``employee``;
    ``employee.user_id`` is the requester user. Returns ``None`` when the
    caller didn't pass a subject (legacy tests) or the employee has no
    linked user.
    """
    employee = getattr(request, "employee", None)
    if employee is None:
        return None
    return getattr(employee, "user_id", None)


def _holds_role(user_id: UUID, org_id: Any, role_code: str) -> bool:
    """True when ``user_id`` holds ``role_code`` inside ``org_id``."""
    return UserRole.objects.filter(
        user_id=user_id,
        role__org_id=org_id,
        role__code=role_code,
    ).exists()


class DirectManagerResolver:
    """Resolves to the user linked to the subject employee's manager.

    ``allow_self_approval`` (opt-in, per chain) lets a requester who holds the
    ``manager`` role clear this stage themselves when there is nobody above
    them — a top-of-chain manager otherwise cannot submit at all, because
    ``engine.submit`` raises ``NoApproverFound`` when level 1 resolves to None.

    Enabled only for the claim chains, where Finance remains a mandatory later
    stage, so self-approval advances the request rather than paying it out.
    Deliberately left OFF for leave: that chain is a single step, so
    self-approval there would be a fully self-granted absence with no second
    pair of eyes. Leave instead uses ``FallbackResolver`` (manager -> dept head
    -> hr_manager), which is the safer answer where a chain has no later gate.
    """

    def __init__(self, allow_self_approval: bool = False) -> None:
        self.allow_self_approval = allow_self_approval

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        org = OrgService()
        mgr_emp = org.get_direct_manager(subject_employee.id)
        requester = _requester_user_id(request)

        candidate = getattr(mgr_emp, "user", None) if mgr_emp is not None else None
        if candidate is not None and not (requester is not None and candidate.id == requester):
            return candidate

        # Either nobody is above this employee, or their manager is themselves.
        if (
            self.allow_self_approval
            and requester is not None
            and _holds_role(requester, subject_employee.org_id, "manager")
        ):
            return User.objects.filter(id=requester).first()
        return None


class DepartmentHeadResolver:
    """Resolves to the user linked to the subject employee's department head.

    Returns None if the head is the requester themselves (self-approval guard).
    """

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        head_id = getattr(subject_employee.department, "head_employee_id", None)
        if head_id is None:
            return None
        from modules.employee.models import Employee

        head = Employee.all_objects.filter(id=head_id).first()
        if head is None:
            return None
        candidate = getattr(head, "user", None)
        if candidate is None:
            return None
        requester = _requester_user_id(request)
        if requester is not None and candidate.id == requester:
            return None
        return candidate


class RoleResolver:
    """Resolves to any user holding the named role within the subject's org.

    Returns the first match (deterministic by user.created_at), excluding the
    requester themselves. If multiple candidates exist, all of them get
    notified by the workflow engine; only one needs to act. (Phase 1
    simplification — Phase 2 may add round-robin.)
    """

    def __init__(self, role_code: str) -> None:
        self.role_code = role_code

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        try:
            role = Role.objects.get(org_id=subject_employee.org_id, code=self.role_code)
        except Role.DoesNotExist:
            return None
        qs = UserRole.objects.filter(role=role).select_related("user")
        requester = _requester_user_id(request)
        if requester is not None:
            qs = qs.exclude(user_id=requester)
        ur = qs.order_by("user__created_at").first()
        return ur.user if ur is not None else None


class FinanceResolver(RoleResolver):
    """Convenience: RoleResolver('finance')."""

    def __init__(self) -> None:
        super().__init__(role_code="finance")


class FallbackResolver:
    """Tries each inner resolver in order; returns the first non-None result.

    Use this when a chain step needs a resolution waterfall. Example:
    direct manager → department head → HR role, so a leave request from
    an employee with no direct manager still finds an approver.
    """

    def __init__(self, *resolvers: Any) -> None:
        if not resolvers:
            raise ValueError("FallbackResolver requires at least one resolver")
        self.resolvers = resolvers

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        for resolver in self.resolvers:
            user = resolver.resolve(subject_employee, request)
            if user is not None:
                return user
        return None
