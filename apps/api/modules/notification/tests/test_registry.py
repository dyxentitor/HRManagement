"""Regression test: proves that registry.py derives DEFAULT_PREFERENCES / SECURITY_TYPES
with byte-identical values to the pre-refactor literals.
"""

from modules.notification.labels import EVENT_LABELS, domain_label, label_for
from modules.notification.registry import REGISTRY
from modules.notification.services.preferences import DEFAULT_PREFERENCES, SECURITY_TYPES

# Exact pre-refactor snapshot (type, in_app, email, security) — order-independent compare.
_EXPECTED = {
    ("auth.login", False, False, True),
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
    "auth.login",
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
