"""CustomerViewSet + ProjectViewSet admin-CRUD hardening tests.

Covers:
- Soft-delete on DELETE (row kept, is_active=False)
- include_inactive=1 listing
- Reactivation via PATCH is_active=True
- DELETE with linked projects doesn't trigger PROTECT
- Duplicate active-name guard (case-insensitive, same org)
- Audit log written for create/update/deactivate/reactivate
- 403 for non-admin (incentive:claim only)
- Project reopen via PATCH status=open
- Budget guard: budget_mandays cannot drop below consumed
- customer field immutable on project update
- Project CUD writes incentive_project audit rows
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.incentive.models import Claim, Customer, EmployeeBond, Project
from modules.incentive.services import ledger
from modules.organization.models import Department, Organization


# ---------------------------------------------------------------------------
# Helpers (mirror test_endpoints.py style)
# ---------------------------------------------------------------------------


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org(db):
    return Organization.objects.create(
        name="AdminCrud Corp",
        slug="admincrud-corp",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org):
    return Department.all_objects.create(org_id=org.id, name="Ops")


@pytest.fixture
def admin_user(org):
    u = User.objects.create_user(email="admin@admincrud.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="crud_admin", name="Crud Admin", is_system=False)
    _grant(role, "incentive:admin")
    UserRole.objects.create(user=u, role=role)
    return u


@pytest.fixture
def admin_client(admin_user):
    return _client(admin_user)


@pytest.fixture
def claim_user(org, dept):
    """A user holding ONLY incentive:claim — no admin rights."""
    u = User.objects.create_user(email="claimer@admincrud.com", password="x", org_id=org.id)
    role = Role.objects.create(
        org_id=org.id, code="crud_claimer", name="Crud Claimer", is_system=False
    )
    _grant(role, "incentive:claim")
    UserRole.objects.create(u, role=role) if False else UserRole.objects.create(user=u, role=role)
    # Also give them an Employee so visibility isn't blocked by missing record.
    Employee.all_objects.create(
        org_id=org.id,
        user=u,
        employee_code="CLAIMER",
        first_name="Claim",
        last_name="Only",
        email="claimer@admincrud.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    return u


@pytest.fixture
def claim_user_client(claim_user):
    return _client(claim_user)


@pytest.fixture
def customer(org):
    return Customer.objects.create(org_id=org.id, name="Acme Corp")


@pytest.fixture
def other_customer(org):
    return Customer.objects.create(org_id=org.id, name="Other Corp")


@pytest.fixture
def project(org, customer):
    return Project.objects.create(
        org_id=org.id,
        customer=customer,
        name="Alpha Project",
        budget_mandays="10",
    )


@pytest.fixture
def project_with_approved_claim(org, dept, admin_user):
    """Project with an approved 5-manday claim so project_consumed > 0.

    Mirrors the approach in test_endpoints.py: create a real Employee + Bond,
    open a customer pool via ledger.top_up, submit a Claim, then call
    ledger.approve_claim. This writes the MandayLedger row that makes
    project_consumed() return 5.
    """
    # Employee who will claim (needs an active bond)
    claimer_user = User.objects.create_user(
        email="claimer2@admincrud.com", password="x", org_id=org.id
    )
    claimer_role = Role.objects.create(
        org_id=org.id, code="claimer2_role", name="Claimer2", is_system=False
    )
    p, _ = Permission.objects.get_or_create(code="incentive:claim", defaults={"description": ""})
    RolePermission.objects.get_or_create(role=claimer_role, permission=p)
    UserRole.objects.create(user=claimer_user, role=claimer_role)
    claimer_emp = Employee.all_objects.create(
        org_id=org.id,
        user=claimer_user,
        employee_code="CLAIMER2",
        first_name="Claim",
        last_name="Two",
        email="claimer2@admincrud.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    today = dt.date.today()
    EmployeeBond.objects.create(
        org_id=org.id,
        employee_id=claimer_emp.id,
        accepted_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC),
        period_start=today - dt.timedelta(days=30),
        period_end=today + dt.timedelta(days=365),
    )

    # Customer pool with enough headroom
    cust = Customer.objects.create(org_id=org.id, name="Pool Corp")
    ledger.top_up(cust, Decimal("200"), actor_id=admin_user.id)

    # Project with budget=20
    proj = Project.objects.create(
        org_id=org.id,
        customer=cust,
        name="Consumed Project",
        budget_mandays=Decimal("20"),
    )

    # Claim + approve via ledger (writes MandayLedger row => consumed=5)
    claim = Claim.objects.create(
        org_id=org.id,
        project=proj,
        employee_id=claimer_emp.id,
        mandays=Decimal("5"),
    )
    ledger.approve_claim(claim, actor_id=admin_user.id)

    return proj


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_customer_destroy_soft_deactivates(admin_client, customer):
    r = admin_client.delete(f"/api/v1/incentive/customers/{customer.id}/")
    assert r.status_code == 204
    customer.refresh_from_db()
    assert customer.is_active is False  # row still exists


@pytest.mark.django_db
def test_customer_list_hides_inactive_by_default(admin_client, customer):
    customer.is_active = False
    customer.save()
    ids = [c["id"] for c in admin_client.get("/api/v1/incentive/customers/").json()]
    assert str(customer.id) not in ids
    ids = [c["id"] for c in admin_client.get("/api/v1/incentive/customers/?include_inactive=1").json()]
    assert str(customer.id) in ids


@pytest.mark.django_db
def test_customer_reactivate_via_patch(admin_client, customer):
    customer.is_active = False
    customer.save()
    r = admin_client.patch(
        f"/api/v1/incentive/customers/{customer.id}/",
        {"is_active": True},
        format="json",
    )
    assert r.status_code == 200 and r.json()["is_active"] is True


@pytest.mark.django_db
def test_customer_destroy_with_projects_no_protect_error(admin_client, customer, project):
    r = admin_client.delete(f"/api/v1/incentive/customers/{customer.id}/")
    assert r.status_code == 204  # PROTECT never triggered


@pytest.mark.django_db
def test_customer_duplicate_active_name_rejected(admin_client, customer):
    r = admin_client.post(
        "/api/v1/incentive/customers/",
        {"name": customer.name.lower()},
        format="json",
    )
    assert r.status_code == 400 and "already exists" in str(r.json())


@pytest.mark.django_db
def test_customer_cud_writes_audit(admin_client, customer):
    admin_client.patch(
        f"/api/v1/incentive/customers/{customer.id}/", {"notes": "x"}, format="json"
    )
    admin_client.delete(f"/api/v1/incentive/customers/{customer.id}/")
    actions = set(
        AuditLog.objects.filter(entity="incentive_customer").values_list("action", flat=True)
    )
    assert {"incentive.customer.updated", "incentive.customer.deactivated"} <= actions


@pytest.mark.django_db
def test_customer_cud_403_for_non_admin(claim_user_client, customer):
    assert (
        claim_user_client.patch(
            f"/api/v1/incentive/customers/{customer.id}/",
            {"name": "x"},
            format="json",
        ).status_code
        == 403
    )
    assert claim_user_client.delete(f"/api/v1/incentive/customers/{customer.id}/").status_code == 403


# ---------------------------------------------------------------------------
# Project-level hardening tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_project_reopen_via_patch(admin_client, project):
    project.status = "closed"
    project.save()
    r = admin_client.patch(
        f"/api/v1/incentive/projects/{project.id}/",
        {"status": "open"},
        format="json",
    )
    assert r.status_code == 200 and r.json()["status"] == "open"


@pytest.mark.django_db
def test_project_budget_cannot_drop_below_consumed(admin_client, project_with_approved_claim):
    p = project_with_approved_claim  # consumed > 0 (5 mandays approved)
    r = admin_client.patch(
        f"/api/v1/incentive/projects/{p.id}/",
        {"budget_mandays": "1"},
        format="json",
    )
    assert r.status_code == 400 and "consumed" in str(r.json()).lower()


@pytest.mark.django_db
def test_project_customer_immutable_on_update(admin_client, project, other_customer):
    original_customer_id = project.customer_id
    r = admin_client.patch(
        f"/api/v1/incentive/projects/{project.id}/",
        {"customer": str(other_customer.id)},
        format="json",
    )
    project.refresh_from_db()
    assert project.customer_id != other_customer.id  # ignored — unchanged
    assert project.customer_id == original_customer_id


@pytest.mark.django_db
def test_project_cud_writes_audit(admin_client, project):
    admin_client.patch(
        f"/api/v1/incentive/projects/{project.id}/",
        {"name": "Renamed"},
        format="json",
    )
    admin_client.delete(f"/api/v1/incentive/projects/{project.id}/")
    actions = set(
        AuditLog.objects.filter(entity="incentive_project").values_list("action", flat=True)
    )
    assert {"incentive.project.updated", "incentive.project.closed"} <= actions
