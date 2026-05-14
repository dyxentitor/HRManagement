"""Tests for v1.9.0 Department DELETE in-use guard."""

from __future__ import annotations

import datetime

import pytest
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture
def org() -> Organization:
    o = Organization.objects.create(
        name="Prov",
        slug="prov-dept",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    set_current_org_id(o.id)
    return o


def _setup_user(org: Organization, perms: list[str]) -> APIClient:
    user = User.objects.create_user(
        email="ad@example.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="r-dept", name="DeptRole", is_system=False)
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "ad@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


def _make_emp(org, dept, code: str, deleted=False) -> Employee:
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=code,
        last_name="X",
        email=f"{code.lower()}@x.com",
        phone="+60123456789",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="KL",
        state="KL",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Maybank",
        emergency_contact_name="X",
        emergency_contact_relationship="father",
        emergency_contact_phone="+60123456789",
        status="active",
    )
    if deleted:
        emp.delete()
    return emp


@pytest.mark.django_db
def test_delete_dept_with_active_employees_blocked(org) -> None:
    d = Department.all_objects.create(org_id=org.id, name="EngBlock")
    _make_emp(org, d, "USER")
    client = _setup_user(org, ["department:read", "department:write"])
    resp = client.delete(f"/api/v1/departments/{d.id}/")
    assert resp.status_code == 400
    serialized = str(resp.json()).lower()
    assert "reassign" in serialized or "active employees" in serialized

    # Department still active (not soft-deleted)
    assert Department.all_objects.filter(id=d.id, deleted_at__isnull=True).exists()


@pytest.mark.django_db
def test_delete_dept_with_only_archived_employees_succeeds(org) -> None:
    d = Department.all_objects.create(org_id=org.id, name="EngArch")
    _make_emp(org, d, "USERX", deleted=True)
    client = _setup_user(org, ["department:read", "department:write"])
    resp = client.delete(f"/api/v1/departments/{d.id}/")
    assert resp.status_code == 204


@pytest.mark.django_db
def test_delete_empty_dept_succeeds(org) -> None:
    d = Department.all_objects.create(org_id=org.id, name="Empty")
    client = _setup_user(org, ["department:read", "department:write"])
    resp = client.delete(f"/api/v1/departments/{d.id}/")
    assert resp.status_code == 204
