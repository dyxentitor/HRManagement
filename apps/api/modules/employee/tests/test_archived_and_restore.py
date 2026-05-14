"""Tests for the v1.9.0 employee archived list filter + restore endpoint."""

from __future__ import annotations

import datetime

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from common.managers import set_current_org_id
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture
def org() -> Organization:
    o = Organization.objects.create(
        name="Provintell",
        slug="provintell-arch",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    set_current_org_id(o.id)
    return o


@pytest.fixture
def dept(org) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


def _setup_user(
    org: Organization, perm_codes: list[str], email: str = "u@example.com"
) -> APIClient:
    user = User.objects.create_user(
        email=email,
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="r-arch", name="ArchRole", is_system=False)
    for code in perm_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


def _make_emp(org, dept, code: str, email: str | None = None) -> Employee:
    defaults = {
        "org_id": org.id,
        "employee_code": code,
        "first_name": code,
        "last_name": "X",
        "email": email or f"{code.lower()}@x.com",
        "phone": "+60123456789",
        "date_of_birth": datetime.date(1990, 1, 1),
        "gender": "other",
        "nationality": "MY",
        "marital_status": "single",
        "address_line1": "x",
        "city": "KL",
        "state": "KL",
        "postcode": "50000",
        "country_code": "MY",
        "department": dept,
        "role_title": "Engineer",
        "employment_type": "fulltime",
        "hire_date": datetime.date(2024, 1, 1),
        "bank_name": "Maybank",
        "emergency_contact_name": "X",
        "emergency_contact_relationship": "father",
        "emergency_contact_phone": "+60123456789",
        "status": "active",
    }
    return Employee.all_objects.create(**defaults)


@pytest.mark.django_db
def test_list_default_excludes_archived(org, dept) -> None:
    active = _make_emp(org, dept, "ALICE")
    archived = _make_emp(org, dept, "BOB")
    archived.delete()  # soft

    client = _setup_user(org, ["employee:read:org"])
    resp = client.get("/api/v1/employees/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body["results"] if isinstance(body, dict) and "results" in body else body
    ids = [e["id"] for e in rows]
    assert str(active.id) in ids
    assert str(archived.id) not in ids


@pytest.mark.django_db
def test_list_status_archived_returns_only_archived(org, dept) -> None:
    active = _make_emp(org, dept, "ALICE")
    archived = _make_emp(org, dept, "BOB")
    archived.delete()

    client = _setup_user(org, ["employee:read:org"])
    resp = client.get("/api/v1/employees/?status=archived")
    assert resp.status_code == 200
    body = resp.json()
    rows = body["results"] if isinstance(body, dict) and "results" in body else body
    ids = [e["id"] for e in rows]
    assert str(active.id) not in ids
    assert str(archived.id) in ids


@pytest.mark.django_db
def test_list_status_all_returns_both(org, dept) -> None:
    _make_emp(org, dept, "ALICE")
    arch = _make_emp(org, dept, "BOB")
    arch.delete()

    client = _setup_user(org, ["employee:read:org"])
    resp = client.get("/api/v1/employees/?status=all")
    body = resp.json()
    rows = body["results"] if isinstance(body, dict) and "results" in body else body
    assert len(rows) >= 2


@pytest.mark.django_db
def test_restore_sets_deleted_at_to_none(org, dept) -> None:
    emp = _make_emp(org, dept, "BOB")
    emp.delete()
    assert emp.deleted_at is not None

    client = _setup_user(org, ["employee:archive"])
    resp = client.post(f"/api/v1/employees/{emp.id}/restore/")
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.deleted_at is None


@pytest.mark.django_db
def test_restore_idempotent_on_active(org, dept) -> None:
    emp = _make_emp(org, dept, "BOB")
    client = _setup_user(org, ["employee:archive"])
    resp = client.post(f"/api/v1/employees/{emp.id}/restore/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_restore_requires_employee_archive_perm(org, dept) -> None:
    emp = _make_emp(org, dept, "BOB")
    emp.delete()
    client = _setup_user(org, ["employee:read:org"])  # no archive perm
    resp = client.post(f"/api/v1/employees/{emp.id}/restore/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_restore_writes_audit_log(org, dept) -> None:
    emp = _make_emp(org, dept, "BOB")
    emp.delete()
    client = _setup_user(org, ["employee:archive"])
    client.post(f"/api/v1/employees/{emp.id}/restore/")
    assert AuditLog.objects.filter(
        action="employee.restored", entity_id=emp.id, org_id=org.id
    ).exists()
