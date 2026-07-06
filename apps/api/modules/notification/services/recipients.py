"""Resolve notification recipient User querysets (org-scoped)."""

from __future__ import annotations

from modules.identity.models import User, UserRole


def role_users(org_id, code):
    """Active users holding the given role code within the org."""
    ids = UserRole.objects.filter(role__org_id=org_id, role__code=code).values_list(
        "user_id", flat=True
    )
    return User.objects.filter(id__in=list(ids), is_active=True)


def hr_manager_users(org_id):
    return role_users(org_id, "hr_manager")


def active_employee_users(org_id):
    return User.objects.filter(org_id=org_id, is_active=True)
