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


class DirectManagerResolver:
    """Resolves to the user linked to the subject employee's manager."""

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        org = OrgService()
        mgr_emp = org.get_direct_manager(subject_employee.id)
        if mgr_emp is None:
            return None
        candidate = getattr(mgr_emp, "user", None)
        if candidate is None:
            return None
        requester = _requester_user_id(request)
        if requester is not None and candidate.id == requester:
            return None
        return candidate


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
