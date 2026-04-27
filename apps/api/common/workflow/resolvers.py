"""Built-in resolvers — direct manager, department head, role-based, finance."""

from __future__ import annotations

from typing import Any

from modules.identity.models import Role, User, UserRole
from modules.identity.services.org import OrgService


class DirectManagerResolver:
    """Resolves to the user linked to the subject employee's manager."""

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        org = OrgService()
        mgr_emp = org.get_direct_manager(subject_employee.id)
        if mgr_emp is None:
            return None
        return getattr(mgr_emp, "user", None)


class DepartmentHeadResolver:
    """Resolves to the user linked to the subject employee's department head."""

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        head_id = getattr(subject_employee.department, "head_employee_id", None)
        if head_id is None:
            return None
        from modules.employee.models import Employee

        head = Employee.all_objects.filter(id=head_id).first()
        if head is None:
            return None
        return getattr(head, "user", None)


class RoleResolver:
    """Resolves to any user holding the named role within the subject's org.

    Returns the first match (deterministic by user.created_at). If multiple
    candidates exist, all of them get notified by the workflow engine; only
    one needs to act. (Phase 1 simplification — Phase 2 may add round-robin.)
    """

    def __init__(self, role_code: str) -> None:
        self.role_code = role_code

    def resolve(self, subject_employee: Any, request: Any) -> User | None:
        try:
            role = Role.objects.get(org_id=subject_employee.org_id, code=self.role_code)
        except Role.DoesNotExist:
            return None
        ur = (
            UserRole.objects.filter(role=role)
            .select_related("user")
            .order_by("user__created_at")
            .first()
        )
        return ur.user if ur is not None else None


class FinanceResolver(RoleResolver):
    """Convenience: RoleResolver('finance')."""

    def __init__(self) -> None:
        super().__init__(role_code="finance")
