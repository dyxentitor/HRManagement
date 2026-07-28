"""Server-side friendly labels for notification types.

Mirrors apps/web/src/modules/notifications/event-labels.ts. Superset — includes
types the frontend map currently omits (assignment.*, feedback.received,
incentive.claim_approved/_rejected, system.*). Phase 3 unifies both to one
API-served registry; keep in sync until then.
"""

from __future__ import annotations

EVENT_LABELS: dict[str, str] = {
    "auth.login": "Successful sign-in",
    "auth.password_changed": "Password changed",
    "auth.mfa_enabled": "Two-step verification enabled",
    "auth.mfa_disabled": "Two-step verification disabled",
    "leave.submitted": "Leave request submitted",
    "leave.approved": "Leave request approved",
    "leave.rejected": "Leave request rejected",
    "leave.cancelled": "Leave request cancelled",
    "leave.replacement_granted": "Replacement leave granted",
    "claim.submitted": "Claim submitted",
    "claim.approved": "Claim approved",
    "claim.rejected": "Claim rejected",
    "claim.reimbursed": "Claim reimbursed",
    "incentive.claim_submitted": "Mandays claim submitted",
    "incentive.claim_approved": "Mandays claim approved",
    "incentive.claim_rejected": "Mandays claim rejected",
    "kpi.cycle_opens_self_review": "KPI self-review window opens",
    "kpi.cycle_opens_manager_review": "KPI manager review opens",
    "kpi.review_submitted_self": "Employee submitted self-review",
    "kpi.review_submitted_manager": "Manager submitted review",
    "cert.expiring_soon": "Certification expiring within 30 days",
    "employee.bank_changed_self": "Bank details changed",
    "employee.contract_ending_soon": "Contract ending within 30 days",
    "employee.probation_ending_soon": "Probation ending within 30 days",
    "schedule.roster_published": "New roster published",
    "assignment.assigned": "New assignment",
    "assignment.reminder": "Assignment due soon",
    "assignment.overdue": "Assignment overdue",
    "announcement.published": "New announcement",
    "payslip.published": "Payslip published",
    "user.role_changed": "Your role was updated",
    "onboarding.activated": "New account activated",
    "feedback.received": "New feedback",
    "system.email_delivery_failed": "Email delivery is failing",
}

DOMAIN_LABELS: dict[str, str] = {
    "auth": "Account & security",
    "user": "Account & security",
    "leave": "Leave",
    "claim": "Claims",
    "incentive": "Incentive",
    "kpi": "KPI & performance",
    "cert": "Certifications",
    "employee": "Employee",
    "schedule": "Schedule",
    "assignment": "Action center",
    "announcement": "Announcements",
    "payslip": "Payroll",
    "onboarding": "Onboarding",
    "feedback": "Feedback",
    "system": "System",
}


def domain_of(type_: str) -> str:
    return type_.split(".", 1)[0] if "." in type_ else type_


def label_for(type_: str) -> str:
    if type_ in EVENT_LABELS:
        return EVENT_LABELS[type_]
    return type_.rsplit(".", 1)[-1].replace("_", " ").title()


def domain_label(type_: str) -> str:
    d = domain_of(type_)
    return DOMAIN_LABELS.get(d, d.title())
