"""Resolve an announcement's audience to a User queryset + membership test."""

from __future__ import annotations

from modules.identity.models import User, UserRole
from modules.notification.services.recipients import active_employee_users


def resolve_audience(org_id, audience_type: str, audience_spec: list):
    """Return the active Users an announcement targets."""
    if audience_type == "all" or not audience_spec:
        return active_employee_users(org_id)
    base = User.objects.filter(org_id=org_id, is_active=True)
    if audience_type == "departments":
        return base.filter(employee_profile__department_id__in=audience_spec)
    if audience_type == "employees":
        return base.filter(employee_profile__id__in=audience_spec)
    if audience_type == "teams":
        return base.filter(employee_profile__team_id__in=audience_spec)
    if audience_type == "roles":
        uids = UserRole.objects.filter(
            role__org_id=org_id, role__code__in=audience_spec
        ).values_list("user_id", flat=True)
        return base.filter(id__in=list(uids))
    return base.none()


def user_in_audience(user, announcement) -> bool:
    """Whether `user` is in `announcement`'s audience (drives the reader feed)."""
    if announcement.audience_type == "all" or not announcement.audience_spec:
        return True
    spec = {str(x) for x in announcement.audience_spec}
    if announcement.audience_type == "roles":
        codes = set(UserRole.objects.filter(user=user).values_list("role__code", flat=True))
        return bool(codes.intersection(spec))
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        return False
    if announcement.audience_type == "departments":
        return str(emp.department_id) in spec
    if announcement.audience_type == "employees":
        return str(emp.id) in spec
    if announcement.audience_type == "teams":
        return str(getattr(emp, "team_id", None)) in spec
    return False
