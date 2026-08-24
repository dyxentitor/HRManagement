"""Regression test: proves that registry.py derives DEFAULT_PREFERENCES / SECURITY_TYPES
with byte-identical values to the pre-refactor literals.
"""

from modules.notification.labels import EVENT_LABELS, domain_label, label_for
from modules.notification.registry import BY_TYPE, REGISTRY
from modules.notification.services.preferences import DEFAULT_PREFERENCES, SECURITY_TYPES

# Exact pre-refactor snapshot (type, in_app, email, security) — order-independent compare.
_EXPECTED = {
    ("auth.password_changed", True, True, True),
    ("auth.mfa_enabled", True, True, True),
    ("auth.mfa_disabled", True, True, True),
    ("employee.bank_changed_self", True, True, True),
    ("employee.probation_ending_soon", True, True, False),
    ("employee.contract_ending_soon", True, True, False),
    ("leave.submitted", True, True, False),
    ("leave.approved", True, True, False),
    ("leave.rejected", True, True, False),
    ("leave.cancelled", True, False, False),
    ("leave.replacement_granted", True, True, False),
    ("claim.submitted", True, True, False),
    ("claim.approved", True, True, False),
    ("claim.rejected", True, True, False),
    ("claim.reimbursed", True, True, False),
    ("incentive.claim_approved", True, False, False),
    ("incentive.claim_rejected", True, False, False),
    ("kpi.cycle_opens_self_review", True, True, False),
    ("kpi.cycle_opens_manager_review", True, True, False),
    ("kpi.review_submitted_self", True, True, False),
    ("kpi.review_submitted_manager", True, True, False),
    ("cert.expiring_soon", True, True, False),
    ("schedule.roster_published", True, True, False),
    ("schedule.swap.approved", True, True, False),
    ("schedule.swap.rejected", True, True, False),
    ("assignment.assigned", True, True, False),
    ("assignment.reminder", True, True, False),
    ("assignment.overdue", True, True, False),
    ("announcement.published", True, False, False),
    ("payslip.published", True, True, False),
    ("user.role_changed", True, True, True),
    ("onboarding.activated", True, False, False),
    ("incentive.claim_submitted", True, True, False),
    ("feedback.received", True, False, False),
    ("system.email_delivery_failed", True, False, False),
}
_EXPECTED_SECURITY = {
    "auth.password_changed",
    "auth.mfa_enabled",
    "auth.mfa_disabled",
    "employee.bank_changed_self",
    "user.role_changed",
}


def test_default_preferences_unchanged_after_merge():
    assert set(DEFAULT_PREFERENCES) == _EXPECTED
    assert len(DEFAULT_PREFERENCES) == len(_EXPECTED)  # no dupes


def test_security_types_unchanged():
    assert set(SECURITY_TYPES) == _EXPECTED_SECURITY


def test_registry_covers_every_type_with_label():
    assert {n.type for n in REGISTRY} == {t for t, *_ in _EXPECTED}
    for n in REGISTRY:
        assert n.label and isinstance(n.label, str)


def test_labels_still_resolve():
    assert EVENT_LABELS["leave.approved"] == "Leave request approved"
    assert label_for("assignment.overdue") == "Assignment overdue"
    assert domain_label("leave.approved") == "Leave"
    assert label_for("unknown.x_y") == "X Y"  # fallback preserved


def test_auth_login_removed_from_registry():
    from modules.notification.registry import BY_TYPE, EVENT_LABELS
    from modules.notification.services.preferences import SECURITY_TYPES

    assert "auth.login" not in BY_TYPE
    assert "auth.login" not in EVENT_LABELS
    assert "auth.login" not in SECURITY_TYPES


def test_context_tokens_declared_on_approval_outcome_types():
    assert BY_TYPE["leave.approved"].context_tokens == ("approver",)
    assert BY_TYPE["leave.rejected"].context_tokens == ("approver",)
    assert BY_TYPE["leave.submitted"].context_tokens == ("requester",)
    assert BY_TYPE["claim.approved"].context_tokens == ("approver",)
    assert BY_TYPE["claim.rejected"].context_tokens == ("approver",)
    assert BY_TYPE["claim.submitted"].context_tokens == ("requester",)


def test_context_tokens_empty_elsewhere():
    assert BY_TYPE["payslip.published"].context_tokens == ()
    assert BY_TYPE["auth.password_changed"].context_tokens == ()


def test_context_tokens_are_bare_names_not_braced():
    for n in REGISTRY:
        for token in n.context_tokens:
            assert "{" not in token and "}" not in token


def test_only_approver_and_requester_context_tokens_exist():
    seen = {t for n in REGISTRY for t in n.context_tokens}
    assert seen == {"approver", "requester"}


def test_sensitive_content_flags():
    for type_code in (
        "leave.approved",
        "leave.rejected",
        "claim.reimbursed",
        "incentive.claim_approved",
        "payslip.published",
        "employee.bank_changed_self",
        "kpi.review_submitted_self",
    ):
        assert BY_TYPE[type_code].sensitive_content is True
    for type_code in (
        "auth.password_changed",
        "announcement.published",
        "schedule.roster_published",
        "kpi.cycle_opens_self_review",
    ):
        assert BY_TYPE[type_code].sensitive_content is False


def test_registry_still_has_35_types():
    assert len(REGISTRY) == 35
