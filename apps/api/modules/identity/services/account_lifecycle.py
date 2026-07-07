"""Cascade an employee's archive/restore onto their linked login account.

Archiving an employee disables their login; restoring re-enables it. Both are
idempotent and safe: unlinked employees are a no-op, and a soft-deleted account
is never silently un-deleted on restore.
"""

from __future__ import annotations

from common.audit.service import append as audit_append
from modules.identity.models import User


def retire_login_for_employee(*, employee, actor_id, org_id) -> None:
    """Disable the employee's linked login on archive.

    Skips when there's no linked account, when the account belongs to the actor
    (self-lockout guard), or when it's already disabled.
    """
    if not employee.user_id or employee.user_id == actor_id:
        return
    user = User.objects.filter(id=employee.user_id, org_id=org_id).first()
    if user is None or user.status == "disabled":
        return
    user.status = "disabled"
    user.is_active = False
    user.save(update_fields=["status", "is_active", "updated_at"])
    audit_append(
        org_id=org_id,
        action="user.disabled",
        entity="user",
        entity_id=user.id,
        after={"reason": "employee_archived", "is_active": False},
    )


def reinstate_login_for_employee(*, employee, org_id) -> None:
    """Re-enable the employee's linked login on restore.

    Skips when there's no linked account, when the account is soft-deleted (leave
    it archived), or when it's already active.
    """
    if not employee.user_id:
        return
    user = User.objects.filter(id=employee.user_id, org_id=org_id).first()
    if user is None or user.deleted_at is not None or user.status == "active":
        return
    user.status = "active"
    user.is_active = True
    user.save(update_fields=["status", "is_active", "updated_at"])
    audit_append(
        org_id=org_id,
        action="user.enabled",
        entity="user",
        entity_id=user.id,
        after={"reason": "employee_restored", "is_active": True},
    )
