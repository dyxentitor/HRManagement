"""Effective approver routing: who really should approve, given delegations and leave fallbacks?

Priority order:
  1. Active manual delegation (delegator -> delegate, scope-matched, date-matched) -> delegate
  2. If candidate is on approved leave today -> walk up to candidate's direct manager
  3. Otherwise -> original candidate
"""

from __future__ import annotations

import datetime
from collections.abc import Callable

from modules.identity.models import User
from modules.identity.services.org import OrgService

from .service import DelegationService


def get_effective_approver(
    *,
    candidate: User | None,
    scope: str,
    on_date: datetime.date,
    is_on_leave_lookup: Callable[[User, datetime.date], bool],
) -> User | None:
    """Return the user that should actually act on this approval step today.

    Args:
        candidate: the resolver-suggested approver (e.g., direct manager).
        scope: 'all' | 'leave' | 'claim'.
        on_date: the date for which routing is being decided (today, usually).
        is_on_leave_lookup: callable that the leave module injects;
            returns True if the given user is on approved leave on the date.
            Injected so this function stays decoupled from the leave module.
    """
    if candidate is None:
        return None

    # 1. Manual delegation
    delegation = DelegationService.find_active(candidate, scope=scope, on_date=on_date)
    if delegation is not None:
        return delegation.delegate

    # 2. Leave fallback
    if is_on_leave_lookup(candidate, on_date):
        # Walk up via OrgService (employee chain). Need to find candidate's
        # employee record first.
        from modules.employee.models import Employee

        employee = Employee.all_objects.filter(user_id=candidate.id).first()
        if employee is None:
            return candidate
        upstream_emp = OrgService().get_direct_manager(employee.id)
        if upstream_emp is None:
            return candidate
        upstream_user = getattr(upstream_emp, "user", None)
        return upstream_user if upstream_user is not None else candidate

    # 3. Original
    return candidate
