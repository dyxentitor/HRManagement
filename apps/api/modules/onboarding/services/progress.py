"""HR onboarding progress aggregation (Phase 3).

Joins signals that already exist — invitation lifecycle, the onboarding wizard's
`User.preferences.onboarding`, profile completeness, MFA, and the onboarding
checklist — into one read-only board. No new storage, no writes.
"""

from __future__ import annotations

import datetime as dt

from django.utils import timezone

from modules.employee.models import Employee
from modules.employee.services.completeness import profile_completeness
from modules.identity.models import Invitation

from ..models import OnboardingChecklist

EXPIRING_SOON = dt.timedelta(hours=24)


def _overall(inv: Invitation, ob: dict, cl_done: int, cl_total: int) -> str:
    status = inv.effective_status
    if status in ("expired", "revoked"):
        return "needs_attention"
    if status in ("sent", "opened") and inv.expires_at - timezone.now() < EXPIRING_SOON:
        return "needs_attention"
    if status == "sent":
        return "invited"
    if status == "opened":
        return "activating"
    # activated
    if ob.get("completed"):
        if cl_total > 0 and cl_done < cl_total:
            return "in_progress"
        return "complete"
    return "in_progress"


def onboarding_progress(org_id) -> list[dict]:
    invitations = list(
        Invitation.objects.filter(org_id=org_id).select_related("user").order_by("-created_at")
    )
    user_ids = [inv.user_id for inv in invitations]

    emps = {
        e.user_id: e
        for e in Employee.all_objects.filter(
            org_id=org_id, user_id__in=user_ids, deleted_at__isnull=True
        ).select_related("department")
    }
    emp_ids = [e.id for e in emps.values()]
    checklists = {
        str(c.employee_id): c
        for c in OnboardingChecklist.all_objects.filter(
            org_id=org_id, employee_id__in=emp_ids, deleted_at__isnull=True
        ).prefetch_related("items")
    }

    rows: list[dict] = []
    for inv in invitations:
        u = inv.user
        emp = emps.get(u.id)
        ob = (u.preferences or {}).get("onboarding") or {}
        comp = profile_completeness(emp) if emp else None
        cl = checklists.get(str(emp.id)) if emp else None
        items = list(cl.items.all()) if cl else []
        cl_done = sum(1 for i in items if i.done)
        cl_total = len(items)
        rows.append(
            {
                "user_id": str(u.id),
                "employee_id": str(emp.id) if emp else None,
                "name": emp.full_name if emp else u.email,
                "email": u.email,
                "department": emp.department.name if emp and emp.department_id else None,
                "invitation_status": inv.effective_status,
                "invitation_sent_at": inv.sent_at.isoformat() if inv.sent_at else None,
                "invitation_expires_at": inv.expires_at.isoformat(),
                "account_activated": inv.status == "activated",
                "profile_percent": comp["percent"] if comp else None,
                "profile_missing": comp["missing"] if comp else [],
                "mfa_enabled": bool(u.mfa_enabled),
                "wizard_step": ob.get("step"),
                "wizard_completed": bool(ob.get("completed")),
                "checklist_id": str(cl.id) if cl else None,
                "checklist_done": cl_done,
                "checklist_total": cl_total,
                "overall": _overall(inv, ob, cl_done, cl_total),
            }
        )
    return rows
