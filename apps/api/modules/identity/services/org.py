"""OrgService — single seam for "who is this person's manager / direct reports / approvers".

Phase 1: backed by the simple `manager_id` chain on the Employee model (which
lands in M2). M1's tests inject a callable `employee_lookup` to exercise the
algorithm without depending on the M2 model.

Phase 2: this same service is rewritten to consult a `reporting_lines` table
when matrix reporting is needed; downstream callers don't change.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any


def _default_employee_lookup(employee_id: uuid.UUID):
    """Default: look up Employee by primary key. Returns None if not found.

    Imports happen inside the function to avoid a Django app-loading cycle
    (identity is loaded before employee).
    Uses all_objects (bypasses TenantScopedManager) so this works without a
    request-scoped org_id in thread-local.
    """
    try:
        from modules.employee.models import Employee

        return Employee.all_objects.filter(id=employee_id).first()
    except Exception:
        return None


@dataclass
class OrgService:
    """Pure-domain helper. Decoupled from the Employee ORM model so it can be
    used in M1 (no Employee yet) by injecting `employee_lookup`."""

    employee_lookup: Callable[[uuid.UUID], Any] = field(default=_default_employee_lookup)
    max_depth: int = 10

    def with_max_depth(self, n: int) -> OrgService:
        return OrgService(employee_lookup=self.employee_lookup, max_depth=n)

    # --- direct lookups ---

    def get_direct_manager(self, employee_id: uuid.UUID):
        emp = self.employee_lookup(employee_id)
        if emp is None or getattr(emp, "manager_id", None) is None:
            return None
        return self.employee_lookup(emp.manager_id)

    def get_reporting_chain(self, employee_id: uuid.UUID, max_depth: int | None = None) -> Iterable:
        depth = max_depth if max_depth is not None else self.max_depth
        chain = []
        current = self.get_direct_manager(employee_id)
        seen: set[uuid.UUID] = set()
        while current is not None and len(chain) < depth:
            if current.id in seen:
                break  # cycle protection
            seen.add(current.id)
            chain.append(current)
            current = self.get_direct_manager(current.id)
        return chain

    def is_manager_of(
        self,
        manager_id: uuid.UUID,
        subject_id: uuid.UUID,
        transitive: bool = False,
    ) -> bool:
        if not transitive:
            mgr = self.get_direct_manager(subject_id)
            return mgr is not None and mgr.id == manager_id
        for ancestor in self.get_reporting_chain(subject_id):
            if ancestor.id == manager_id:
                return True
        return False

    # --- approval routing ---

    def get_approvers(self, employee_id: uuid.UUID, action: str) -> list:
        """Return the list of Employee-like objects that approve `action` for `employee_id`.

        Phase 1: defaults to a single-level direct-manager chain. M1b-4 will
        consult `approval_delegations` (delegation lookup happens at the
        WorkflowEngine level in M3+, not here — this function just returns
        candidates).
        """
        mgr = self.get_direct_manager(employee_id)
        return [mgr] if mgr is not None else []
