"""API tests for the Organization Chart endpoints."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _org(slug: str = "x") -> Organization:
    return Organization.objects.create(
        name="X",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _emp(org, dept, code, manager=None, first=""):
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=first or code,
        last_name="x",
        email=f"{code.lower()}@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        manager=manager,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


def _client(org, email, role_code, perms) -> APIClient:
    user = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code=role_code, name=role_code, is_system=True)
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": "x"}, format="json"
    ).json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client


def _org_client(org) -> APIClient:
    return _client(org, "hr@x.com", "hr_manager", ["employee:read:org"])


@pytest.mark.django_db
def test_roots_endpoint():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    _emp(org, dept, "CEO", first="Jane")
    resp = _org_client(org).get("/api/v1/org-chart/roots/")
    assert resp.status_code == 200
    assert resp.json()[0]["full_name"] == "Jane x"


@pytest.mark.django_db
def test_children_requires_manager_param():
    org = _org()
    resp = _org_client(org).get("/api/v1/org-chart/children/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_children_endpoint():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    _emp(org, dept, "VP", manager=ceo, first="Sam")
    resp = _org_client(org).get(f"/api/v1/org-chart/children/?manager={ceo.id}")
    assert resp.status_code == 200
    assert resp.json()[0]["manager_name"] == "CEO x"


@pytest.mark.django_db
def test_search_endpoint():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO", first="Jane")
    _emp(org, dept, "VP", manager=ceo, first="Priya")
    resp = _org_client(org).get("/api/v1/org-chart/search/?q=priya")
    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["ancestor_ids"] == [str(ceo.id)]


@pytest.mark.django_db
def test_departments_and_members():
    org = _org()
    d1 = Department.all_objects.create(org_id=org.id, name="Eng")
    a = _emp(org, d1, "A")
    client = _org_client(org)
    groups = client.get("/api/v1/org-chart/departments/").json()
    assert {g["name"]: g["head_count"] for g in groups} == {"Eng": 1}
    members = client.get(f"/api/v1/org-chart/departments/{d1.id}/members/").json()
    assert [m["id"] for m in members] == [str(a.id)]


@pytest.mark.django_db
def test_members_404_for_foreign_department():
    org = _org()
    other = _org(slug="y")
    foreign_dept = Department.all_objects.create(org_id=other.id, name="Other")
    resp = _org_client(org).get(f"/api/v1/org-chart/departments/{foreign_dept.id}/members/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_perm_gate_403_without_read_org():
    org = _org()
    low = _client(org, "emp@x.com", "employee", ["employee:read:self"])
    resp = low.get("/api/v1/org-chart/roots/")
    assert resp.status_code == 403
