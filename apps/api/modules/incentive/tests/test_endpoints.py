"""Endpoint + RBAC + SOC-visibility tests for the incentive API."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.incentive.models import Claim, Customer, EmployeeBond, Project
from modules.organization.models import Department, Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


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


def _bond(org, emp):
    today = dt.date.today()
    EmployeeBond.objects.create(
        org_id=org.id,
        employee_id=emp.id,
        accepted_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC),
        period_start=today - dt.timedelta(days=30),
        period_end=today + dt.timedelta(days=365),
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x-inc-ep",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        settings={"incentive": {"soc_role_codes": ["soc"]}},
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    roles = {
        "admin": ["incentive:admin", "incentive:claim"],
        "manager": ["incentive:project:write", "incentive:claim"],
        "employee": ["incentive:claim"],
        "soc": ["incentive:claim"],
    }
    users, emps = {}, {}
    for code, perms in roles.items():
        u = User.objects.create_user(email=f"{code}@x.com", password="x", org_id=org.id)
        r = Role.objects.create(org_id=org.id, code=code, name=code, is_system=False)
        _grant(r, *perms)
        UserRole.objects.create(user=u, role=r)
        users[code] = u
        emps[code] = _emp(org, dept, code.upper(), user=u)
    for code in ("employee", "soc", "manager"):
        _bond(org, emps[code])
    return {
        "org": org,
        "dept": dept,
        "u": users,
        "e": emps,
        "c": {k: _client(u) for k, u in users.items()},
    }


def _customer_with_pool(stack, mandays=200):
    cust = Customer.objects.create(org_id=stack["org"].id, name="Acme")
    from modules.incentive.services import ledger

    ledger.top_up(cust, mandays, actor_id=stack["e"]["admin"].id)
    return cust


def test_admin_creates_customer_and_tops_up(stack):
    r = stack["c"]["admin"].post("/api/v1/incentive/customers/", {"name": "Acme"}, format="json")
    assert r.status_code == 201, r.content
    cid = r.json()["id"]
    r2 = stack["c"]["admin"].post(
        f"/api/v1/incentive/customers/{cid}/top_up/", {"mandays": "150"}, format="json"
    )
    assert r2.status_code == 200
    assert Decimal(r2.json()["mandays_remaining"]) == Decimal("150")


def test_project_deadline_persists(stack):
    cust = _customer_with_pool(stack)
    rp = stack["c"]["manager"].post(
        "/api/v1/incentive/projects/",
        {
            "customer": str(cust.id),
            "name": "Dated",
            "budget_mandays": "10",
            "deadline": "2026-09-30",
        },
        format="json",
    )
    assert rp.status_code == 201, rp.content
    assert rp.json()["deadline"] == "2026-09-30"


def test_admin_without_employee_record_can_open_project(stack):
    # Regression: admins have no linked Employee, so manager_id is null on their projects.
    org = stack["org"]
    role = Role.objects.create(org_id=org.id, code="bareadmin", name="Bare Admin")
    p, _ = Permission.objects.get_or_create(
        code="incentive:project:write", defaults={"description": "x"}
    )
    RolePermission.objects.create(role=role, permission=p)
    u = User.objects.create_user(email="bare@x.com", password="x", org_id=org.id)  # NO employee
    UserRole.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(u)
    cust = _customer_with_pool(stack)
    r = c.post(
        "/api/v1/incentive/projects/",
        {"customer": str(cust.id), "name": "Admin project", "budget_mandays": "10"},
        format="json",
    )
    assert r.status_code == 201, r.content
    assert r.json()["manager_id"] is None


def test_non_admin_cannot_see_customers(stack):
    assert stack["c"]["employee"].get("/api/v1/incentive/customers/").status_code == 403


def test_manager_opens_project_employee_claims_manager_approves(stack):
    cust = _customer_with_pool(stack)
    rp = stack["c"]["manager"].post(
        "/api/v1/incentive/projects/",
        {"customer": str(cust.id), "name": "Pentest", "budget_mandays": "40"},
        format="json",
    )
    assert rp.status_code == 201, rp.content
    pid = rp.json()["id"]
    rc = stack["c"]["employee"].post(
        "/api/v1/incentive/claims/", {"project": pid, "mandays": "5"}, format="json"
    )
    assert rc.status_code == 201, rc.content
    claim_id = rc.json()["id"]
    ra = stack["c"]["manager"].post(f"/api/v1/incentive/claims/{claim_id}/approve/")
    assert ra.status_code == 200, ra.content
    assert ra.json()["status"] == "approved"
    assert ra.json()["payout_status"] == "pending"


def test_employee_cannot_approve(stack):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="P",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
    )
    claim = Claim.objects.create(
        org_id=stack["org"].id,
        project=proj,
        employee_id=stack["e"]["employee"].id,
        mandays=Decimal("5"),
    )
    r = stack["c"]["employee"].post(f"/api/v1/incentive/claims/{claim.id}/approve/")
    assert r.status_code in (403, 404)


def test_ineligible_employee_cannot_claim(stack):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="P",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
    )
    EmployeeBond.objects.filter(employee_id=stack["e"]["employee"].id).delete()
    r = stack["c"]["employee"].post(
        "/api/v1/incentive/claims/", {"project": str(proj.id), "mandays": "5"}, format="json"
    )
    assert r.status_code == 400


def test_soc_visibility_default_hidden_then_opt_in(stack):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="Secret",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
        include_soc=False,
    )
    # SOC user can't see it in the list, and can't claim it.
    listed = stack["c"]["soc"].get("/api/v1/incentive/projects/").json()
    ids = [p["id"] for p in (listed if isinstance(listed, list) else listed.get("results", []))]
    assert str(proj.id) not in ids
    blocked = stack["c"]["soc"].post(
        "/api/v1/incentive/claims/", {"project": str(proj.id), "mandays": "5"}, format="json"
    )
    assert blocked.status_code == 403
    # Manager opts SOC in -> now visible + claimable.
    proj.include_soc = True
    proj.save(update_fields=["include_soc"])
    ok = stack["c"]["soc"].post(
        "/api/v1/incentive/claims/", {"project": str(proj.id), "mandays": "5"}, format="json"
    )
    assert ok.status_code == 201, ok.content


def test_admin_reverses_approved_claim(stack):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="P",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
    )
    from modules.incentive.services import ledger

    claim = Claim.objects.create(
        org_id=stack["org"].id,
        project=proj,
        employee_id=stack["e"]["employee"].id,
        mandays=Decimal("5"),
    )
    ledger.approve_claim(claim, actor_id=stack["e"]["manager"].id)
    r = stack["c"]["admin"].post(
        f"/api/v1/incentive/claims/{claim.id}/reverse/", {"reason": "x"}, format="json"
    )
    assert r.status_code == 200, r.content
    claim.refresh_from_db()
    assert claim.status == "cancelled"
    assert ledger.customer_remaining(cust.id) == Decimal("200")


def _pending_claim(stack, mandays="5"):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="P",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
    )
    return Claim.objects.create(
        org_id=stack["org"].id,
        project=proj,
        employee_id=stack["e"]["employee"].id,
        mandays=Decimal(mandays),
    )


def test_cancel_pending_claim(stack):
    claim = _pending_claim(stack)
    r = stack["c"]["employee"].post(f"/api/v1/incentive/claims/{claim.id}/cancel/")
    assert r.status_code == 200, r.content
    claim.refresh_from_db()
    assert claim.status == "cancelled"


def test_cancel_requires_owner(stack):
    claim = _pending_claim(stack)
    r = stack["c"]["soc"].post(f"/api/v1/incentive/claims/{claim.id}/cancel/")
    assert r.status_code in (403, 404)
    claim.refresh_from_db()
    assert claim.status == "pending"


def test_cancel_only_pending(stack):
    claim = _pending_claim(stack)
    from modules.incentive.services import ledger

    ledger.approve_claim(claim, actor_id=stack["e"]["manager"].id)
    r = stack["c"]["employee"].post(f"/api/v1/incentive/claims/{claim.id}/cancel/")
    assert r.status_code == 400


def test_edit_pending_claim(stack):
    claim = _pending_claim(stack)
    r = stack["c"]["employee"].patch(
        f"/api/v1/incentive/claims/{claim.id}/", {"mandays": "8", "note": "revised"}, format="json"
    )
    assert r.status_code == 200, r.content
    claim.refresh_from_db()
    assert claim.mandays == Decimal("8")
    assert claim.note == "revised"


def test_edit_blocked_when_not_pending(stack):
    claim = _pending_claim(stack)
    from modules.incentive.services import ledger

    ledger.approve_claim(claim, actor_id=stack["e"]["manager"].id)
    r = stack["c"]["employee"].patch(
        f"/api/v1/incentive/claims/{claim.id}/", {"mandays": "8"}, format="json"
    )
    assert r.status_code == 400
    claim.refresh_from_db()
    assert claim.mandays == Decimal("5")


def test_me_summary_earnings(stack):
    cust = _customer_with_pool(stack)
    proj = Project.objects.create(
        org_id=stack["org"].id,
        customer=cust,
        name="P",
        budget_mandays=Decimal("40"),
        manager_id=stack["e"]["manager"].id,
    )
    from modules.incentive.services import ledger

    claim = Claim.objects.create(
        org_id=stack["org"].id,
        project=proj,
        employee_id=stack["e"]["employee"].id,
        mandays=Decimal("5"),
    )
    ledger.approve_claim(claim, actor_id=stack["e"]["manager"].id)
    r = stack["c"]["employee"].get("/api/v1/incentive/me/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["has_employee"] is True
    assert body["eligibility"]["is_active"] is True
    assert Decimal(body["earnings"]["earned_mandays"]) == Decimal("5")
    assert Decimal(body["earnings"]["earned_rm"]) == Decimal("250")
    assert Decimal(body["payout"]["mandays"]) == Decimal("5")
    assert len(body["claims"]) == 1


def test_me_summary_no_employee(stack):
    org = stack["org"]
    role = Role.objects.create(org_id=org.id, code="claimonly", name="Claim Only")
    _grant(role, "incentive:claim")
    u = User.objects.create_user(email="noemp@x.com", password="x", org_id=org.id)  # NO employee
    UserRole.objects.create(user=u, role=role)
    r = _client(u).get("/api/v1/incentive/me/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["has_employee"] is False
    assert body["eligibility"]["is_active"] is False
    assert body["claims"] == []


def test_bond_accept(stack):
    bond = EmployeeBond.objects.create(
        org_id=stack["org"].id,
        employee_id=stack["e"]["admin"].id,
        period_start=dt.date.today(),
        period_end=dt.date.today() + dt.timedelta(days=365),
    )
    r = stack["c"]["admin"].post(f"/api/v1/incentive/bonds/{bond.id}/accept/")
    assert r.status_code == 200, r.content
    bond.refresh_from_db()
    assert bond.accepted_at is not None
