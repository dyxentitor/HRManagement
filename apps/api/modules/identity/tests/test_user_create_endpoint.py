"""v1.11.0 Task 7 — user-first create endpoint.

POST /api/v1/users/ creates a User (via the shared provision_user service) and,
when an optional `employee` object is present, creates + links an Employee in
the same transaction. A failure in the inner employee insert rolls the user
creation back (atomic).
"""

import os

import pytest
from cryptography.fernet import Fernet
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org(db) -> Organization:
    call_command("seed_permission_catalogue")
    o = Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    call_command("seed_default_roles", "--org-id", str(o.id))
    return o


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


def _login(client: APIClient, email: str, password: str) -> None:
    login = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")


def _admin_client(org: Organization) -> tuple[APIClient, User]:
    """org_admin — has user:create (seeded)."""
    user = User.objects.create_user(
        email="admin@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.get(org_id=org.id, code="org_admin")
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    _login(client, "admin@x.com", "x")  # pragma: allowlist secret
    return client, user


def _client_without_user_create(org: Organization) -> tuple[APIClient, User]:
    """Custom role lacking user:create."""
    user = User.objects.create_user(
        email="noperm@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(
        org_id=org.id, code="no_user_create", name="No User Create", is_system=False
    )
    p, _ = Permission.objects.get_or_create(code="employee:read:org", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    _login(client, "noperm@x.com", "x")  # pragma: allowlist secret
    return client, user


def _employee_payload(dept: Department, email: str) -> dict:
    """The 7 mandatory employee fields."""
    return {
        "employee_code": "PVT-300",
        "first_name": "Wei",
        "last_name": "Lin",
        "email": email,
        "hire_date": "2024-06-01",
        "department": str(dept.id),
        "employment_type": "fulltime",
    }


@pytest.mark.django_db
def test_create_user_only(org: Organization) -> None:
    client, _ = _admin_client(org)
    body = {
        "email": "auditor@example.com",
        "role_code": "auditor",
        "credential_method": "invite",
    }
    resp = client.post("/api/v1/users/", body, format="json")
    assert resp.status_code == 201, resp.content

    assert User.objects.filter(org_id=org.id, email="auditor@example.com").exists()
    user = User.objects.get(org_id=org.id, email="auditor@example.com")
    assert not Employee.all_objects.filter(user_id=user.id).exists()


@pytest.mark.django_db
def test_create_user_with_employee(org: Organization, dept: Department) -> None:
    client, _ = _admin_client(org)
    email = "wei@example.com"
    body = {
        "email": email,
        "role_code": "employee",
        "credential_method": "invite",
        "employee": _employee_payload(dept, email),
    }
    resp = client.post("/api/v1/users/", body, format="json")
    assert resp.status_code == 201, resp.content

    emp = Employee.all_objects.get(org_id=org.id, employee_code="PVT-300")
    assert emp.user_id is not None
    assert emp.user.email == email


@pytest.mark.django_db
def test_create_user_requires_perm(org: Organization) -> None:
    client, _ = _client_without_user_create(org)
    body = {
        "email": "blocked@example.com",
        "role_code": "auditor",
        "credential_method": "invite",
    }
    resp = client.post("/api/v1/users/", body, format="json")
    assert resp.status_code == 403, resp.content
    assert not User.objects.filter(org_id=org.id, email="blocked@example.com").exists()


@pytest.mark.django_db
def test_create_user_duplicate_email_returns_400(org: Organization) -> None:
    client, _ = _admin_client(org)
    User.objects.create_user(
        email="dupe@example.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    body = {
        "email": "dupe@example.com",
        "role_code": "auditor",
        "credential_method": "invite",
    }
    resp = client.post("/api/v1/users/", body, format="json")
    assert resp.status_code == 400, resp.content


@pytest.mark.django_db
def test_create_user_with_invalid_employee_rolls_back(org: Organization, dept: Department) -> None:
    client, _ = _admin_client(org)
    email = "rollback@example.com"
    emp = _employee_payload(dept, email)
    del emp["employee_code"]  # incomplete — missing a mandatory field
    body = {
        "email": email,
        "role_code": "employee",
        "credential_method": "invite",
        "employee": emp,
    }
    resp = client.post("/api/v1/users/", body, format="json")
    assert resp.status_code == 400, resp.content
    # Rollback: the user must NOT have committed.
    assert not User.objects.filter(org_id=org.id, email=email).exists()
