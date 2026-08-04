"""Tests for the one-time 2026 leave-balance migration command."""

from __future__ import annotations

import datetime
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command

from modules.employee.models import Employee
from modules.leave.management.commands.migrate_leave_balances_2026 import (
    MIGRATION_ROWS,
    REFERENCE_TYPE,
)
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db

TYPE_SPECS = [
    ("ANNUAL", "Annual Leave", "annual"),
    ("MEDICAL", "Sick Leave", "annual"),
    ("HOSPITALIZATION", "Hospitalization Leave", "annual"),
    ("COMPASSIONATE", "Compassionate Leave", "event_based"),
]


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def leave_types(org: Organization) -> dict[str, LeaveType]:
    out = {}
    for code, name, accrual in TYPE_SPECS:
        out[code] = LeaveType.all_objects.create(
            org_id=org.id,
            code=code,
            name=name,
            accrual_type=accrual,
            default_days=Decimal("0"),
            is_paid=True,
            is_statutory=False,
            gender_restriction="any",
        )
    return out


def _employee(org: Organization, code: str) -> Employee:
    dept = Department.all_objects.filter(org_id=org.id).first() or Department.all_objects.create(
        org_id=org.id, name="Ops"
    )
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=code,
        last_name="Test",
        email=f"{code.lower()}@test.com",
        department=dept,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
    )


@pytest.fixture
def all_employees(org: Organization) -> dict[str, Employee]:
    return {code: _employee(org, code) for code, _, _ in MIGRATION_ROWS}


def _run(**kw) -> str:
    out = StringIO()
    call_command("migrate_leave_balances_2026", stdout=out, **kw)
    return out.getvalue()


def test_dry_run_writes_nothing(org, leave_types, all_employees) -> None:
    text = _run(dry_run=True)
    assert "PREVIEW" in text
    assert "DRY RUN" in text
    assert LeaveBalance.all_objects.count() == 0
    assert LeaveBalanceLedger.objects.count() == 0


def test_migrates_expected_values(org, leave_types, all_employees) -> None:
    _run()
    # 11 employees x 4 leave types
    assert LeaveBalance.all_objects.count() == 44

    # spot-check the richest row: Tan Mun Kit ANNUAL (18 entitled, 53.5 CF, 1 taken)
    bal = LeaveBalance.all_objects.get(
        employee_id=all_employees["EMP-2026-0015"].id,
        leave_type=leave_types["ANNUAL"],
        year=2026,
    )
    assert bal.entitled == Decimal("18")
    assert bal.accrued == Decimal("18")  # available uses accrued, not entitled
    assert bal.carried_forward == Decimal("53.5")
    assert bal.taken == Decimal("1")
    assert bal.pending == Decimal("0")
    assert bal.carried_forward_expires_at is None  # confirmed: no expiry
    # available = accrued + carried_forward - taken - pending
    assert bal.available == Decimal("70.5")

    # a half-day taken value survives the round trip
    tasneem = LeaveBalance.all_objects.get(
        employee_id=all_employees["EMP-2026-0012"].id,
        leave_type=leave_types["ANNUAL"],
        year=2026,
    )
    assert tasneem.taken == Decimal("1.5")

    # carry-forward only ever lands on ANNUAL
    non_annual = LeaveBalance.all_objects.exclude(leave_type=leave_types["ANNUAL"])
    assert all(b.carried_forward == Decimal("0") for b in non_annual)


def test_writes_audit_ledger(org, leave_types, all_employees) -> None:
    _run()
    refs = LeaveBalanceLedger.objects.filter(reference_type=REFERENCE_TYPE)
    assert refs.exists()
    reasons = set(refs.values_list("reason", flat=True))
    assert reasons == {"accrual", "carry_forward", "manual_adjustment"}
    # taken is recorded as a negative delta
    assert all(r.delta < 0 for r in refs.filter(reason="manual_adjustment"))


def test_rerun_is_idempotent(org, leave_types, all_employees) -> None:
    _run()
    balances = LeaveBalance.all_objects.count()
    ledger = LeaveBalanceLedger.objects.count()

    second = _run()
    assert "already migrated" in second.lower()
    assert LeaveBalance.all_objects.count() == balances
    assert LeaveBalanceLedger.objects.count() == ledger


def test_rerun_does_not_clobber_later_activity(org, leave_types, all_employees) -> None:
    """A re-run must not wipe leave taken after the migration."""
    _run()
    bal = LeaveBalance.all_objects.get(
        employee_id=all_employees["EMP-2026-0010"].id,
        leave_type=leave_types["ANNUAL"],
        year=2026,
    )
    bal.taken = Decimal("3")
    bal.save(update_fields=["taken"])

    _run()
    bal.refresh_from_db()
    assert bal.taken == Decimal("3"), "re-run must not reset post-migration activity"


def test_missing_employee_is_reported_not_fatal(org, leave_types) -> None:
    """Only some employees exist — the rest are reported as problems, no crash."""
    _employee(org, "EMP-2026-0015")
    text = _run()
    assert "no active employee record" in text
    assert LeaveBalance.all_objects.count() == 4  # only the one employee's 4 types


def test_skipped_names_are_not_migrated(org, leave_types, all_employees) -> None:
    """The four data-less workbook rows must never appear."""
    codes = {c for c, _, _ in MIGRATION_ROWS}
    assert "EMP-2026-0011" not in codes  # Pang Yat Ming
    assert "EMP-2026-0013" not in codes  # Ahmad Arif Aiman
    assert "EMP-2026-0001" not in codes  # archived Syafiq duplicate
    assert "EMP-2026-0014" not in codes  # Dummy Account
    assert len(MIGRATION_ROWS) == 11
