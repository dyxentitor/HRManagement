"""v1.11.0 Task 6 — optional login provisioning on employee create (atomic).

The employee-create endpoint accepts an optional `provision` object. When
present, a User is created and linked to the new Employee inside the same
transaction, so a provisioning failure (e.g. duplicate email) rolls the
employee insert back.
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
    # Seed the permission catalogue + default roles so role_code lookups like
    # "employee" resolve inside provision_user, and so org_admin/hr_manager
    # come pre-loaded with employee:create + user:create.
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
    """org_admin — has both employee:create and user:create (seeded)."""
    user = User.objects.create_user(
        email="admin@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.get(org_id=org.id, code="org_admin")
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    _login(client, "admin@x.com", "x")  # pragma: allowlist secret
    return client, user


def _creator_without_user_create(org: Organization) -> tuple[APIClient, User]:
    """Custom role with employee:create but NOT user:create."""
    user = User.objects.create_user(
        email="creator@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(
        org_id=org.id, code="emp_creator", name="Employee Creator", is_system=False
    )
    for code in ("employee:read:org", "employee:create"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    _login(client, "creator@x.com", "x")  # pragma: allowlist secret
    return client, user


def _employee_payload(dept: Department) -> dict:
    """The 7 mandatory employee fields."""
    return {
        "employee_code": "PVT-200",
        "first_name": "Wei",
        "last_name": "Lin",
        "email": "wei@example.com",
        "hire_date": "2024-06-01",
        "department": str(dept.id),
        "employment_type": "fulltime",
    }


@pytest.mark.django_db
def test_create_employee_with_provision_creates_and_links_user(
    org: Organization, dept: Department
) -> None:
    client, _ = _admin_client(org)
    body = {
        **_employee_payload(dept),
        "provision": {"role_code": "employee", "credential_method": "invite"},
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    assert resp.status_code == 201, resp.content

    emp = Employee.all_objects.get(id=resp.json()["id"])
    assert emp.user_id is not None
    assert emp.user.email == "wei@example.com"


@pytest.mark.django_db
def test_create_employee_provision_duplicate_email_rolls_back(
    org: Organization, dept: Department
) -> None:
    client, _ = _admin_client(org)
    # Pre-existing active user with the same email.
    User.objects.create_user(
        email="wei@example.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    body = {
        **_employee_payload(dept),
        "provision": {"role_code": "employee", "credential_method": "invite"},
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    assert resp.status_code == 400, resp.content
    # Rollback: the employee insert must NOT have committed.
    assert not Employee.all_objects.filter(org_id=org.id, employee_code="PVT-200").exists()


@pytest.mark.django_db
def test_create_employee_without_provision_unchanged(org: Organization, dept: Department) -> None:
    client, _ = _admin_client(org)
    resp = client.post("/api/v1/employees/", _employee_payload(dept), format="json")
    assert resp.status_code == 201, resp.content

    emp = Employee.all_objects.get(id=resp.json()["id"])
    assert emp.user_id is None


@pytest.mark.django_db
def test_provision_missing_role_code_returns_400(org: Organization, dept: Department) -> None:
    client, _ = _admin_client(org)
    body = {
        **_employee_payload(dept),
        "provision": {"credential_method": "invite"},  # no role_code
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    # Malformed client input must be a clean 400, never an unhandled 500.
    assert resp.status_code == 400, resp.content
    # Rollback: the employee insert must NOT have committed.
    assert not Employee.all_objects.filter(org_id=org.id, employee_code="PVT-200").exists()


@pytest.mark.django_db
def test_provision_missing_credential_method_returns_400(
    org: Organization, dept: Department
) -> None:
    client, _ = _admin_client(org)
    body = {
        **_employee_payload(dept),
        "provision": {"role_code": "employee"},  # no credential_method
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    # Malformed client input must be a clean 400, never an unhandled 500.
    assert resp.status_code == 400, resp.content
    # Rollback: the employee insert must NOT have committed.
    assert not Employee.all_objects.filter(org_id=org.id, employee_code="PVT-200").exists()


@pytest.mark.django_db
def test_provision_non_dict_returns_400(org: Organization, dept: Department) -> None:
    client, _ = _admin_client(org)
    body = {
        **_employee_payload(dept),
        "provision": "oops",  # a string, not an object
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    # Malformed provision must be a clean 400, never an unhandled 500.
    assert resp.status_code == 400, resp.content
    # No employee row created.
    assert not Employee.all_objects.filter(org_id=org.id, employee_code="PVT-200").exists()


@pytest.mark.django_db
def test_provision_requires_user_create_perm(org: Organization, dept: Department) -> None:
    client, _ = _creator_without_user_create(org)
    body = {
        **_employee_payload(dept),
        "provision": {"role_code": "employee", "credential_method": "invite"},
    }
    resp = client.post("/api/v1/employees/", body, format="json")
    assert resp.status_code == 403, resp.content
    # The perm gate fires BEFORE the transaction opens — no employee row.
    assert not Employee.all_objects.filter(org_id=org.id, employee_code="PVT-200").exists()
