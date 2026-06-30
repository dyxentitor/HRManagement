"""Money-critical tests for the incentive ledger engine."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from modules.employee.models import Employee
from modules.incentive.models import Claim, Customer, EmployeeBond, MandayLedger, Project
from modules.incentive.services import ledger
from modules.organization.models import Department, Organization


def _emp(org, dept, code, user=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code}@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )


def _bond(org, emp, *, accepted=True):
    today = dt.date.today()
    return EmployeeBond.objects.create(
        org_id=org.id,
        employee_id=emp.id,
        accepted_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC) if accepted else None,
        period_start=today - dt.timedelta(days=30),
        period_end=today + dt.timedelta(days=365),
    )


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x-inc",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    mgr = _emp(org, dept, "MGR")
    claimant = _emp(org, dept, "CLM")
    _bond(org, claimant)
    customer = Customer.objects.create(org_id=org.id, name="Acme")
    project = Project.objects.create(
        org_id=org.id,
        customer=customer,
        name="Pentest",
        budget_mandays=Decimal("40"),
        manager_id=mgr.id,
    )
    return {
        "org": org,
        "dept": dept,
        "mgr": mgr,
        "clm": claimant,
        "cust": customer,
        "proj": project,
    }


def _claim(s, mandays):
    return Claim.objects.create(
        org_id=s["org"].id,
        project=s["proj"],
        employee_id=s["clm"].id,
        mandays=Decimal(str(mandays)),
    )


def test_top_up_sets_customer_remaining(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("200")
    assert MandayLedger.objects.filter(ledger_type="pool_topup").count() == 1


def test_approve_mints_one_payout_and_drains_both(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    claim = _claim(stack, 5)
    ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    claim.refresh_from_db()
    assert claim.status == "approved"
    assert claim.payout_status == "pending"
    assert claim.billing_quarter  # e.g. "2026-Q3"
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 1
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("195")
    assert stack["proj"].mandays_remaining == Decimal("35")
    assert ledger.earnings_for(stack["clm"].id, stack["org"].id) == Decimal("5")


def test_double_approve_is_idempotent(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    claim = _claim(stack, 5)
    ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    with pytest.raises(ValidationError):
        ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 1


def test_claim_over_project_budget_rejected(stack):
    ledger.top_up(stack["cust"], 1000, actor_id=stack["mgr"].id)  # pool is plentiful
    claim = _claim(stack, 41)  # budget is 40
    with pytest.raises(ValidationError):
        ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 0


def test_claim_over_customer_pool_rejected(stack):
    ledger.top_up(stack["cust"], 3, actor_id=stack["mgr"].id)  # pool only 3
    claim = _claim(stack, 5)  # within budget (40) but over pool
    with pytest.raises(ValidationError):
        ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 0


def test_reject_mints_nothing(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    claim = _claim(stack, 5)
    ledger.reject_claim(claim, actor_id=stack["mgr"].id, reason="dup")
    claim.refresh_from_db()
    assert claim.status == "rejected"
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 0
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("200")


def test_reverse_writes_balancing_reclaim_and_restores(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    claim = _claim(stack, 5)
    ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("195")
    ledger.reverse_claim(claim, actor_id=stack["mgr"].id, reason="error")
    claim.refresh_from_db()
    assert claim.status == "cancelled"
    assert MandayLedger.objects.filter(ledger_type="reclaimed").count() == 1
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("200")  # restored
    assert stack["proj"].mandays_remaining == Decimal("40")  # restored
    assert ledger.earnings_for(stack["clm"].id, stack["org"].id) == Decimal("0")  # netted out


def test_ineligible_claimant_blocked(stack):
    ledger.top_up(stack["cust"], 200, actor_id=stack["mgr"].id)
    EmployeeBond.objects.filter(employee_id=stack["clm"].id).delete()  # no bond => ineligible
    claim = _claim(stack, 5)
    with pytest.raises(ValidationError):
        ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert MandayLedger.objects.filter(ledger_type="claim_payout").count() == 0


def test_decimal_precision(stack):
    ledger.top_up(stack["cust"], "10.50", actor_id=stack["mgr"].id)
    claim = _claim(stack, "2.25")
    ledger.approve_claim(claim, actor_id=stack["mgr"].id)
    assert ledger.customer_remaining(stack["cust"].id) == Decimal("8.25")
    assert ledger.earnings_for(stack["clm"].id, stack["org"].id) == Decimal("2.25")


def test_rate_default_and_rm_conversion(stack):
    assert ledger.settings_rate(stack["org"].id) == Decimal("50")
    assert ledger.credits_to_rm(Decimal("3"), stack["org"].id) == Decimal("150")


def test_is_soc_and_visibility(stack):
    # No SOC roles configured => nobody is SOC, everyone can see.
    assert ledger.is_soc(stack["clm"]) is False
    assert ledger.can_see_project(stack["clm"], stack["proj"]) is True
