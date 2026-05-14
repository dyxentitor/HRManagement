"""v1.9.0 — admin Settings Overview endpoint.

Single GET that returns stats + attention counts + 5 recent admin audit-log
entries. Gated on role:read (same gate as the sidebar Settings nav).
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit.models import AuditLog
from common.feature_flags.models import FeatureFlag
from common.feature_flags.registry import CRITICAL_MODULES, TOGGLABLE_MODULES
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, User
from modules.identity.permissions import HRMSPermission
from modules.organization.models import Department

ADMIN_ACTIONS: tuple[str, ...] = (
    "role.granted",
    "role.revoked",
    "team.created",
    "team.updated",
    "team.deleted",
    "department.created",
    "department.updated",
    "department.deleted",
    "leave_type.created",
    "leave_type.updated",
    "feature_flag.changed",
    "org.logo_updated",
    "org.logo_removed",
    "org.settings_updated",
    "employee.restored",
    "employee.user_linked",
    "employee.user_unlinked",
)


def _summarize(log: AuditLog) -> str:
    payload = log.after or log.before or {}
    name = payload.get("name") if isinstance(payload, dict) else None
    if log.action == "leave_type.created":
        return f'Leave type "{name or "?"}" created'
    if log.action == "department.created":
        return f'Department "{name or "?"}" created'
    if log.action == "team.created":
        return f'Team "{name or "?"}" created'
    if log.action == "org.logo_updated":
        return "Organization logo updated"
    if log.action == "org.logo_removed":
        return "Organization logo removed"
    if log.action == "org.settings_updated":
        return "Organization settings updated"
    if log.action == "employee.user_linked":
        return "Employee linked to user"
    if log.action == "employee.user_unlinked":
        return "Employee unlinked from user"
    if log.action == "employee.restored":
        return "Employee restored"
    return log.action


class SettingsOverviewView(APIView):
    """GET /api/v1/admin/settings-overview/ — single roll-up for the
    Settings hub Overview page.
    """

    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["role:read"]

    def get(self, request):
        org_id = request.user.org_id

        flags = list(FeatureFlag.objects.filter(org_id=org_id))
        modules_total = len(TOGGLABLE_MODULES) + len(CRITICAL_MODULES)
        toggleable_enabled = sum(1 for f in flags if f.enabled)
        modules_enabled = toggleable_enabled + len(CRITICAL_MODULES)

        return Response(
            {
                "stats": {
                    "employees_active": Employee.objects.filter(
                        org_id=org_id, deleted_at__isnull=True
                    ).count(),
                    "employees_archived": Employee.all_objects.filter(
                        org_id=org_id, deleted_at__isnull=False
                    ).count(),
                    "departments": Department.objects.filter(org_id=org_id).count(),
                    "modules_enabled": modules_enabled,
                    "modules_total": modules_total,
                    "roles": Role.objects.filter(org_id=org_id).count(),
                    "perm_codes": Permission.objects.count(),
                },
                "attention": {
                    "unlinked_users_count": User.objects.filter(
                        org_id=org_id, employee_profile__isnull=True
                    ).count(),
                    "unlinked_employees_count": Employee.objects.filter(
                        org_id=org_id, user_id__isnull=True, deleted_at__isnull=True
                    ).count(),
                },
                "recent_activity": [
                    {
                        "action": log.action,
                        "summary": _summarize(log),
                        "occurred_at": log.ts.isoformat(),
                    }
                    for log in AuditLog.objects.filter(
                        org_id=org_id, action__in=ADMIN_ACTIONS
                    ).order_by("-ts")[:5]
                ],
            }
        )
