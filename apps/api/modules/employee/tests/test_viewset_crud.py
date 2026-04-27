"""HR CRUD on /api/v1/employees/."""

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
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


def _hr_client(org: Organization) -> tuple[APIClient, User]:
    user = User.objects.create_user(
        email="hr@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR Manager", is_system=True)
    for code in (
        "employee:read:org",
        "employee:write:org",
        "employee:create",
        "employee:archive",
    ):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "hr@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client, user


def _employee_payload(dept: Department) -> dict:
    return {
        "employee_code": "PVT-100",
        "first_name": "Wei",
        "last_name": "Lin",
        "email": "wei@example.com",
        "phone": "+60123456789",
        "date_of_birth": "1992-03-15",
        "gender": "female",
        "nationality": "MY",
        "marital_status": "single",
        "address_line1": "1 Jalan Provintell",
        "city": "PJ",
        "state": "Selangor",
        "postcode": "46050",
        "country_code": "MY",
        "department": str(dept.id),
        "role_title": "Senior Engineer",
        "employment_type": "fulltime",
        "hire_date": "2024-06-01",
        "bank_name": "Maybank",
        "emergency_contact_name": "Mom",
        "emergency_contact_relationship": "mother",
        "emergency_contact_phone": "+60123456788",
    }


@pytest.mark.django_db
def test_hr_can_list_employees(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    Employee.all_objects.create(org_id=org.id, **{**_employee_payload(dept), "department": dept})
    resp = client.get("/api/v1/employees/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    assert any(r["employee_code"] == "PVT-100" for r in rows)


@pytest.mark.django_db
def test_hr_can_create_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    resp = client.post("/api/v1/employees/", _employee_payload(dept), format="json")
    assert resp.status_code == 201, resp.content


@pytest.mark.django_db
def test_hr_can_update_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    emp = Employee.all_objects.create(
        org_id=org.id, **{**_employee_payload(dept), "department": dept}
    )
    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"role_title": "Lead Engineer"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.role_title == "Lead Engineer"


@pytest.mark.django_db
def test_hr_can_soft_delete_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    emp = Employee.all_objects.create(
        org_id=org.id, **{**_employee_payload(dept), "department": dept}
    )
    resp = client.delete(f"/api/v1/employees/{emp.id}/")
    assert resp.status_code in (200, 204)
    emp.refresh_from_db()
    assert emp.deleted_at is not None


@pytest.mark.django_db
def test_employee_without_perm_cannot_list(org: Organization, dept: Department) -> None:
    user = User.objects.create_user(
        email="emp@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    p, _ = Permission.objects.get_or_create(code="employee:read:self", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "emp@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    resp = client.get("/api/v1/employees/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_create_returns_401(org: Organization, dept: Department) -> None:
    client = APIClient()
    resp = client.post("/api/v1/employees/", _employee_payload(dept), format="json")
    assert resp.status_code == 401
