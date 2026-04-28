"""Smoke tests for all 15 reports — just verify queryset runs without error."""

from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest
from cryptography.fernet import Fernet

from common.reporting.registry import REGISTRY


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _make_user(org_id):
    """Return a mock user with org_id."""
    user = MagicMock()
    user.org_id = org_id
    return user


@pytest.fixture
def org_stack():
    from modules.organization.models import Organization

    org = Organization.objects.create(
        name="SmokeOrg",
        slug="smokeorg",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    return org


_REPORT_CODES = [
    "leave.balance_summary",
    "leave.taken_period",
    "leave.pending_approvals",
    "attendance.daily_summary",
    "attendance.late_absent_log",
    "attendance.hours_worked",
    "claims.pending_by_approver",
    "claims.spend_by_category",
    "claims.reimbursement_status",
    "kpi.cycle_progress",
    "cert.expiring_soon",
    "headcount.snapshot",
    "hrops.probation_ending",
    "hrops.contract_ending",
    "hrops.birthdays_this_month",
]


@pytest.mark.django_db
@pytest.mark.parametrize("code", _REPORT_CODES)
def test_report_queryset_runs(code, org_stack):
    """All registered reports: queryset() must not raise and schema must be valid."""
    cls = REGISTRY.get(code)
    assert cls is not None, f"Report '{code}' not registered"

    user = _make_user(org_stack.id)
    qs = cls.queryset(filters={}, user=user)
    # Just consuming the queryset should not raise
    list(qs)

    schema = cls.schema()
    assert schema["code"] == code
    assert isinstance(schema["columns"], list)


@pytest.mark.django_db
def test_all_15_reports_registered():
    for code in _REPORT_CODES:
        assert code in REGISTRY, f"Missing report: {code}"
    assert len(_REPORT_CODES) == 15
