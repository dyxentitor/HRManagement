"""Notification preferences -- system default catalogue + helpers."""

from __future__ import annotations

from modules.notification.models import NotificationPreference

# (type, in_app_default, email_default, security_relevant)
# security_relevant: True means user can't disable (always sent)
DEFAULT_PREFERENCES: list[tuple[str, bool, bool, bool]] = [
    # auth
    ("auth.login", False, False, True),
    ("auth.password_changed", True, True, True),
    ("auth.mfa_enabled", True, True, True),
    ("auth.mfa_disabled", True, True, True),
    # employee
    ("employee.bank_changed_self", True, True, True),  # HR notification
    ("employee.probation_ending_soon", True, True, False),
    ("employee.contract_ending_soon", True, True, False),
    # leave
    ("leave.submitted", True, False, False),  # to approver
    ("leave.approved", True, True, False),  # to requester
    ("leave.rejected", True, True, False),
    ("leave.cancelled", True, False, False),
    ("leave.replacement_granted", True, True, False),
    # claims
    ("claim.submitted", True, False, False),
    ("claim.approved", True, True, False),
    ("claim.rejected", True, True, False),
    ("claim.reimbursed", True, True, False),
    # incentive (mandays) — in-app only for v1
    ("incentive.claim_approved", True, False, False),
    ("incentive.claim_rejected", True, False, False),
    # kpi
    ("kpi.cycle_opens_self_review", True, True, False),
    ("kpi.cycle_opens_manager_review", True, True, False),
    ("kpi.review_submitted_self", True, False, False),
    ("kpi.review_submitted_manager", True, True, False),
    # certification
    ("cert.expiring_soon", True, True, False),
    # schedule
    ("schedule.roster_published", True, True, False),
    # assignments / action center
    ("assignment.assigned", True, True, False),
    ("assignment.reminder", True, True, False),
    ("assignment.overdue", True, True, False),
    # announcements
    ("announcement.published", True, False, False),
    # payroll
    ("payslip.published", True, True, False),
    # identity / onboarding
    ("user.role_changed", True, True, True),  # security-relevant
    ("onboarding.activated", True, False, False),  # to HR
    # incentive submission (to approver)
    ("incentive.claim_submitted", True, False, False),
    # feedback
    ("feedback.status_changed", True, False, False),
]

SECURITY_TYPES: frozenset[str] = frozenset(t for t, _i, _e, sec in DEFAULT_PREFERENCES if sec)


def is_security_type(type_code: str) -> bool:
    return type_code in SECURITY_TYPES


def default_for(type_code: str, channel: str) -> bool:
    for t, in_app, email, _ in DEFAULT_PREFERENCES:
        if t == type_code:
            return in_app if channel == "in_app" else email
    return True  # unknown type: opt-in by default


def is_enabled(*, user, type_code: str, channel: str) -> bool:
    """True if user wants this notification on this channel.

    Security-relevant types always return True regardless of preference.
    """
    if is_security_type(type_code):
        return True
    pref = NotificationPreference.objects.filter(
        user=user,
        type=type_code,
        channel=channel,
    ).first()
    if pref is not None:
        return pref.enabled
    return default_for(type_code, channel)


def seed_for_user(user) -> int:
    """Seed default preferences for a freshly-created user. Idempotent."""
    n_created = 0
    for type_code, in_app, email, _ in DEFAULT_PREFERENCES:
        for channel, enabled in [("in_app", in_app), ("email", email)]:
            _, created = NotificationPreference.objects.get_or_create(
                user=user,
                type=type_code,
                channel=channel,
                defaults={"enabled": enabled},
            )
            if created:
                n_created += 1
    return n_created
