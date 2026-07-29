"""BondViewSet admin tests — coverage endpoint, re-consent, validations, audit.

Covers:
- /bonds/coverage/ returns one row per active employee with the right status
  (none / pending / active / expired)
- coverage is 403 for non-admin
- duplicate bond for the same employee -> 400
- period_end <= period_start -> 400
- editing terms_version clears accepted_at (re-consent); period-only edits keep it
- revoke (DELETE) hard-deletes but writes an incentive_bond audit snapshot first
- create/update write audit rows
"""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.incentive.models import EmployeeBond
from modules.organization.models import Department, Organization

# ---------------------------------------------------------------------------
# Helpers / fixtures (mirror test_admin_crud.py style)
# ---------------------------------------------------------------------------


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def org(db):
    return Organization.objects.create(
        name="Bonds Corp",
        slug="bonds-corp",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org):
    return Department.all_objects.create(org_id=org.id, name="Ops")


@pytest.fixture
def admin_client(org):
    u = User.objects.create_user(email="admin@bonds.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="bond_admin", name="Bond Admin", is_system=False)
    _grant(role, "incentive:admin")
    UserRole.objects.create(user=u, role=role)
    return _client(u)


@pytest.fixture
def claim_client(org, dept):
    u = User.objects.create_user(email="claimer@bonds.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="bond_claim", name="Bond Claim", is_system=False)
    _grant(role, "incentive:claim")
    UserRole.objects.create(user=u, role=role)
    Employee.all_objects.create(
        org_id=org.id,
        user=u,
        employee_code="CLAIMER",
        first_name="Claim",
        last_name="Only",
        email="claimer@bonds.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    return _client(u)


@pytest.fixture
def make_employee(org, dept):
    counter = {"n": 0}

    def _make(first_name="Emp"):
        counter["n"] += 1
        n = counter["n"]
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=f"B{n:03d}",
            first_name=first_name,
            last_name=f"Bond{n}",
            email=f"emp{n}@bonds.com",
            department=dept,
            employment_type="fulltime",
            hire_date=dt.date(2024, 1, 1),
        )

    return _make


def _mk_bond(org, emp, *, start, end, accepted):
    return EmployeeBond.objects.create(
        org_id=org.id,
        employee_id=emp.id,
        period_start=start,
        period_end=end,
        accepted_at=timezone.now() if accepted else None,
    )


COVERAGE = "/api/v1/incentive/bonds/coverage/"
BONDS = "/api/v1/incentive/bonds/"


# ---------------------------------------------------------------------------
# Coverage endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_coverage_statuses(admin_client, org, make_employee):
    today = timezone.localdate()
    e_none = make_employee("Nobond")
    e_pending = make_employee("Pending")
    e_active = make_employee("Active")
    e_expired = make_employee("Expired")
    _mk_bond(org, e_pending, start=today, end=today + dt.timedelta(days=90), accepted=False)
    _mk_bond(org, e_active, start=today - dt.timedelta(days=10), end=today + dt.timedelta(days=90), accepted=True)
    _mk_bond(org, e_expired, start=today - dt.timedelta(days=200), end=today - dt.timedelta(days=10), accepted=True)

    r = admin_client.get(COVERAGE)
    assert r.status_code == 200
    by_id = {row["employee_id"]: row for row in r.json()}
    assert by_id[str(e_none.id)]["status"] == "none"
    assert by_id[str(e_none.id)]["bond"] is None
    assert by_id[str(e_pending.id)]["status"] == "pending"
    assert by_id[str(e_active.id)]["status"] == "active"
    assert by_id[str(e_active.id)]["bond"]["is_active"] is True
    assert by_id[str(e_expired.id)]["status"] == "expired"
    # name enrichment present
    assert by_id[str(e_none.id)]["employee_name"].startswith("Nobond")
    assert by_id[str(e_none.id)]["employee_code"] == e_none.employee_code


@pytest.mark.django_db
def test_coverage_403_for_non_admin(claim_client):
    assert claim_client.get(COVERAGE).status_code == 403


# ---------------------------------------------------------------------------
# Validations
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_duplicate_bond_rejected(admin_client, org, make_employee):
    emp = make_employee()
    today = timezone.localdate()
    _mk_bond(org, emp, start=today, end=today + dt.timedelta(days=30), accepted=False)
    r = admin_client.post(
        BONDS,
        {
            "employee_id": str(emp.id),
            "period_start": str(today),
            "period_end": str(today + dt.timedelta(days=60)),
        },
        format="json",
    )
    assert r.status_code == 400
    assert "already has a bond" in str(r.json())


@pytest.mark.django_db
def test_period_end_must_be_after_start(admin_client, make_employee):
    emp = make_employee()
    today = timezone.localdate()
    r = admin_client.post(
        BONDS,
        {
            "employee_id": str(emp.id),
            "period_start": str(today),
            "period_end": str(today - dt.timedelta(days=1)),
        },
        format="json",
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Re-consent on terms change
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_terms_change_resets_acceptance(admin_client, org, make_employee):
    emp = make_employee()
    today = timezone.localdate()
    bond = _mk_bond(org, emp, start=today, end=today + dt.timedelta(days=90), accepted=True)
    r = admin_client.patch(f"{BONDS}{bond.id}/", {"terms_version": "v2"}, format="json")
    assert r.status_code == 200
    bond.refresh_from_db()
    assert bond.terms_version == "v2"
    assert bond.accepted_at is None  # must re-accept


@pytest.mark.django_db
def test_period_change_keeps_acceptance(admin_client, org, make_employee):
    emp = make_employee()
    today = timezone.localdate()
    bond = _mk_bond(org, emp, start=today, end=today + dt.timedelta(days=90), accepted=True)
    r = admin_client.patch(
        f"{BONDS}{bond.id}/", {"period_end": str(today + dt.timedelta(days=180))}, format="json"
    )
    assert r.status_code == 200
    bond.refresh_from_db()
    assert bond.accepted_at is not None


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_bond_cud_writes_audit(admin_client, org, make_employee):
    emp = make_employee()
    today = timezone.localdate()
    r = admin_client.post(
        BONDS,
        {
            "employee_id": str(emp.id),
            "period_start": str(today),
            "period_end": str(today + dt.timedelta(days=90)),
        },
        format="json",
    )
    assert r.status_code == 201
    bond_id = r.json()["id"]
    admin_client.patch(f"{BONDS}{bond_id}/", {"terms_version": "v2"}, format="json")
    r = admin_client.delete(f"{BONDS}{bond_id}/")
    assert r.status_code == 204
    assert not EmployeeBond.objects.filter(id=bond_id).exists()  # hard delete

    actions = set(
        AuditLog.objects.filter(entity="incentive_bond").values_list("action", flat=True)
    )
    assert {
        "incentive.bond.created",
        "incentive.bond.updated",
        "incentive.bond.revoked",
    } <= actions
    # revoked row carries a snapshot
    revoked = AuditLog.objects.filter(entity="incentive_bond", action="incentive.bond.revoked").first()
    assert revoked.after["employee_id"] == str(emp.id)
    assert revoked.after["period_start"] == str(today)


@pytest.mark.django_db
def test_accept_writes_audit_with_actor_info(org, dept, make_employee):
    # employee with a linked user accepts their own bond
    emp = make_employee("Acceptor")
    u = User.objects.create_user(email="acceptor@bonds.com", password="x", org_id=org.id)
    emp.user = u
    emp.save(update_fields=["user"])
    role = Role.objects.create(org_id=org.id, code="bond_self", name="Bond Self", is_system=False)
    _grant(role, "incentive:claim")
    UserRole.objects.create(user=u, role=role)
    today = timezone.localdate()
    bond = _mk_bond(org, emp, start=today, end=today + dt.timedelta(days=90), accepted=False)

    c = _client(u)
    r = c.post(f"{BONDS}{bond.id}/accept/")
    assert r.status_code == 200
    bond.refresh_from_db()
    assert bond.accepted_at is not None

    row = AuditLog.objects.filter(
        entity="incentive_bond", action="incentive.bond.accepted"
    ).first()
    assert row is not None
    assert row.after["employee_id"] == str(emp.id)
    assert row.after["terms_version"] == bond.terms_version
    assert row.after["accepted_at"]  # timestamp recorded

    # idempotent: second accept doesn't double-audit
    c.post(f"{BONDS}{bond.id}/accept/")
    assert (
        AuditLog.objects.filter(entity="incentive_bond", action="incentive.bond.accepted").count()
        == 1
    )
