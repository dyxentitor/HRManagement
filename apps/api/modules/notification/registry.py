"""Single source of truth for notification-type metadata.

REGISTRY is authoritative. `preferences.DEFAULT_PREFERENCES`/`SECURITY_TYPES` and
`labels.*` are derived views over it; the frontend `event-labels.generated.ts` is
generated from it (`manage.py export_notification_registry`). Edit types HERE.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NotificationType:
    type: str
    label: str
    in_app_default: bool
    email_default: bool
    security: bool
    # Context tokens this type can bind at emit time, as bare names (no braces).
    # A token is declared only where a call site can actually supply it.
    context_tokens: tuple[str, ...] = ()
    # True when the rendered card exposes personal detail beyond the bare fact
    # that an event occurred. Drives an advisory caution in the admin UI; gates
    # nothing.
    sensitive_content: bool = False


# (type, label, in_app_default, email_default, security)
REGISTRY: tuple[NotificationType, ...] = (
    NotificationType("auth.password_changed", "Password changed", True, True, True),
    NotificationType("auth.mfa_enabled", "Two-step verification enabled", True, True, True),
    NotificationType("auth.mfa_disabled", "Two-step verification disabled", True, True, True),
    NotificationType(
        "employee.bank_changed_self",
        "Bank details changed",
        True,
        True,
        True,
        sensitive_content=True,
    ),
    NotificationType(
        "employee.probation_ending_soon", "Probation ending within 30 days", True, True, False
    ),
    NotificationType(
        "employee.contract_ending_soon", "Contract ending within 30 days", True, True, False
    ),
    NotificationType(
        "leave.submitted",
        "Leave request submitted",
        True,
        True,
        False,
        context_tokens=("requester",),
        sensitive_content=True,
    ),
    NotificationType(
        "leave.approved",
        "Leave request approved",
        True,
        True,
        False,
        context_tokens=("approver",),
        sensitive_content=True,
    ),
    NotificationType(
        "leave.rejected",
        "Leave request rejected",
        True,
        True,
        False,
        context_tokens=("approver",),
        sensitive_content=True,
    ),
    NotificationType(
        "leave.cancelled",
        "Leave request cancelled",
        True,
        False,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "leave.replacement_granted",
        "Replacement leave granted",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "claim.submitted",
        "Claim submitted",
        True,
        True,
        False,
        context_tokens=("requester",),
        sensitive_content=True,
    ),
    NotificationType(
        "claim.approved",
        "Claim approved",
        True,
        True,
        False,
        context_tokens=("approver",),
        sensitive_content=True,
    ),
    NotificationType(
        "claim.rejected",
        "Claim rejected",
        True,
        True,
        False,
        context_tokens=("approver",),
        sensitive_content=True,
    ),
    NotificationType(
        "claim.reimbursed",
        "Claim reimbursed",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "incentive.claim_approved",
        "Mandays claim approved",
        True,
        False,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "incentive.claim_rejected",
        "Mandays claim rejected",
        True,
        False,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "kpi.cycle_opens_self_review", "KPI self-review window opens", True, True, False
    ),
    NotificationType(
        "kpi.cycle_opens_manager_review", "KPI manager review opens", True, True, False
    ),
    NotificationType(
        "kpi.review_submitted_self",
        "Employee submitted self-review",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType(
        "kpi.review_submitted_manager",
        "Manager submitted review",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType("cert.expiring_soon", "Certification expiring soon", True, True, False),
    NotificationType("schedule.roster_published", "New roster published", True, True, False),
    NotificationType("schedule.swap.approved", "Shift swap approved", True, True, False),
    NotificationType("schedule.swap.rejected", "Shift swap rejected", True, True, False),
    NotificationType("assignment.assigned", "New assignment", True, True, False),
    NotificationType("assignment.reminder", "Assignment due soon", True, True, False),
    NotificationType("assignment.overdue", "Assignment overdue", True, True, False),
    NotificationType("announcement.published", "New announcement", True, False, False),
    NotificationType(
        "payslip.published",
        "Payslip published",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType("user.role_changed", "Your role was updated", True, True, True),
    NotificationType("onboarding.activated", "New account activated", True, False, False),
    NotificationType(
        "incentive.claim_submitted",
        "Mandays claim submitted",
        True,
        True,
        False,
        sensitive_content=True,
    ),
    NotificationType("feedback.received", "New feedback", True, False, False),
    NotificationType(
        "system.email_delivery_failed", "Email delivery is failing", True, False, False
    ),
)

BY_TYPE: dict[str, NotificationType] = {n.type: n for n in REGISTRY}

EVENT_LABELS: dict[str, str] = {n.type: n.label for n in REGISTRY}

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
    n = BY_TYPE.get(type_)
    if n is not None:
        return n.label
    return type_.rsplit(".", 1)[-1].replace("_", " ").title()


def domain_label(type_: str) -> str:
    d = domain_of(type_)
    return DOMAIN_LABELS.get(d, d.title())
