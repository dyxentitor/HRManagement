"""Archiving an employee retires their linked login; restore re-enables it (v1.56.1)."""

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
        name="X",
        slug="casc",
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


def _admin_client(org, email="admin@x.com") -> tuple[APIClient, User]:
    user = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="r-casc", name="R", is_system=False)
    for code in ("employee:archive", "employee:read:org"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": "x"}, format="json"
    ).json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client, user


def _emp(org, dept, code, user=None) -> Employee:
    e = Employee.all_objects.create(
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
        emergency_contact_name="X",
        emergency_contact_relationship="father",
        emergency_contact_phone="+60123456789",
        status="active",
    )
    if user is not None:
        e.user = user
        e.save(update_fields=["user"])
    return e


@pytest.mark.django_db
def test_archive_disables_login(org, dept):
    client, _admin = _admin_client(org)
    target = User.objects.create_user(email="t@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp = _emp(org, dept, "TARGET", user=target)
    resp = client.delete(f"/api/v1/employees/{emp.id}/")
    assert resp.status_code in (200, 204)
    target.refresh_from_db()
    assert target.status == "disabled" and target.is_active is False


@pytest.mark.django_db
def test_restore_reenables_login(org, dept):
    client, _admin = _admin_client(org)
    target = User.objects.create_user(email="t@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp = _emp(org, dept, "TARGET", user=target)
    client.delete(f"/api/v1/employees/{emp.id}/")
    resp = client.post(f"/api/v1/employees/{emp.id}/restore/")
    assert resp.status_code == 200
    target.refresh_from_db()
    assert target.status == "active" and target.is_active is True


@pytest.mark.django_db
def test_archive_unlinked_employee_is_noop(org, dept):
    client, _admin = _admin_client(org)
    emp = _emp(org, dept, "NOUSER")
    resp = client.delete(f"/api/v1/employees/{emp.id}/")
    assert resp.status_code in (200, 204)


@pytest.mark.django_db
def test_archive_own_employee_does_not_lock_self(org, dept):
    client, admin = _admin_client(org)
    emp = _emp(org, dept, "SELF", user=admin)
    client.delete(f"/api/v1/employees/{emp.id}/")
    admin.refresh_from_db()
    assert admin.status == "active" and admin.is_active is True
