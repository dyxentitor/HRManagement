"""Tests for the incentive command-center overview endpoint."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.incentive.models import Claim, Customer, EmployeeBond, Project
from modules.incentive.services import ledger
from modules.organization.models import Department, Organization


def _emp(org, dept, code, user=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code.lower()}@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )


def _client_with(org, *perm_codes):
    role = Role.objects.create(org_id=org.id, code="r", name="R")
    for c in perm_codes:
        p, _ = Permission.objects.get_or_create(code=c, defaults={"description": c})
        RolePermission.objects.create(role=role, permission=p)
    u = User.objects.create_user(email="actor@x.com", password="x", org_id=org.id)
    UserRole.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(u)
    return c, u


@pytest.fixture
def world(db):
    org = Organization.objects.create(
        name="X",
        slug="x-ov",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    mgr = _emp(org, dept, "MGR")
    clm = _emp(org, dept, "CLM")
    today0 = dt.date.today()
    EmployeeBond.objects.create(
        org_id=org.id, employee_id=clm.id, accepted_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC),
        period_start=today0 - dt.timedelta(days=30), period_end=today0 + dt.timedelta(days=365),
    )
    cust = Customer.objects.create(org_id=org.id, name="Acme")
    ledger.top_up(cust, 200, actor_id=mgr.id)
    today = dt.date.today()
    proj = Project.objects.create(
        org_id=org.id,
        customer=cust,
        name="Pentest",
        budget_mandays=Decimal("40"),
        manager_id=mgr.id,
        include_soc=True,
        deadline=today + dt.timedelta(days=10),
    )
    # an active claim approved (=> consumes pool/budget, gives earnings) + one pending
    c1 = Claim.objects.create(org_id=org.id, project=proj, employee_id=clm.id, mandays=Decimal("8"))
    ledger.approve_claim(c1, actor_id=mgr.id)
    Claim.objects.create(org_id=org.id, project=proj, employee_id=clm.id, mandays=Decimal("3"))
    return {"org": org, "clm": clm, "cust": cust, "proj": proj}


def test_overview_requires_manager_or_admin(world):
    # plain user (no incentive manage perms) → 403
    c, _ = _client_with(world["org"], "incentive:claim")
    assert c.get("/api/v1/incentive/overview/").status_code == 403


def test_overview_kpis_and_sections(world):
    c, _ = _client_with(world["org"], "incentive:project:write")
    r = c.get("/api/v1/incentive/overview/")
    assert r.status_code == 200, r.content
    body = r.json()
    k = body["kpis"]
    assert k["active_projects"] == 1 and k["total_projects"] == 1
    assert k["pending_claims"] == 1 and k["approved_claims"] == 1
    assert Decimal(k["pool_remaining"]) == Decimal("192")  # 200 - 8 approved
    assert Decimal(k["consumed"]) == Decimal("8")
    assert k["soc_projects"] == 1
    assert Decimal(k["payout_rm_quarter"]) == Decimal("400")  # 8 md * RM50

    # top contributor = the claimant with 8 md
    assert Decimal(body["top_contributors"][0]["mandays"]) == Decimal("8")
    assert Decimal(body["top_contributors"][0]["rm"]) == Decimal("400")

    # deadline surfaces (not overdue)
    assert len(body["deadlines"]) == 1
    assert body["deadlines"][0]["overdue"] is False

    # recent activity has the topup + payout
    types = {a["type"] for a in body["recent_activity"]}
    assert {"pool_topup", "claim_payout"} <= types


def test_overview_marks_overdue(world):
    world["proj"].deadline = dt.date.today() - dt.timedelta(days=2)
    world["proj"].save(update_fields=["deadline"])
    c, _ = _client_with(world["org"], "incentive:admin")
    body = c.get("/api/v1/incentive/overview/").json()
    assert body["deadlines"][0]["overdue"] is True
