"""Task 4 — wire leave_grant into POST /api/v1/users/.

Tests that the leave_grant block, when enabled, seeds LeaveBalance rows for
the newly created employee inside the same atomic transaction.
"""

import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from django.core.management import call_command
from rest_framework.test import APIClient

from modules.identity.models import Role, User, UserRole
from modules.leave.models import LeaveBalance, LeaveType
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures — mirroring the pattern in test_user_create_endpoint.py
# ---------------------------------------------------------------------------


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
def a_department(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Engineering")


@pytest.fixture
def api_client_admin(org: Organization) -> APIClient:
    user = User.objects.create_user(
        email="admin@test.com", password="admin!pass123", org_id=org.id  # pragma: allowlist secret
    )
    role = Role.objects.get(org_id=org.id, code="org_admin")
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "admin@test.com", "password": "admin!pass123"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_create_user_with_employee_grants_leave(
    api_client_admin: APIClient, org: Organization, a_department: Department
) -> None:
    """201 response + LeaveBalance row for the created employee."""
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        default_days=Decimal("8"),
        accrual_type="annual",
    )
    body = {
        "email": "newhire@example.com",
        "role_code": "employee",
        "credential_method": "temp",
        "temp_password": "Temp!pass123",  # pragma: allowlist secret
        "employee": {
            "employee_code": "NH001",
            "first_name": "New",
            "last_name": "Hire",
            "email": "newhire@example.com",
            "hire_date": "2026-01-01",
            "department": str(a_department.id),
            "employment_type": "fulltime",
        },
        "leave_grant": {
            "enabled": True,
            "items": [
                {
                    "leave_type_id": str(lt.id),
                    "days_per_year": "8",
                    "permanent": False,
                }
            ],
        },
    }
    r = api_client_admin.post("/api/v1/users/", body, format="json")
    assert r.status_code == 201, r.content

    from modules.employee.models import Employee

    emp = Employee.all_objects.get(email="newhire@example.com")
    assert LeaveBalance.all_objects.filter(
        employee_id=emp.id, leave_type=lt, year=2026
    ).exists()


def test_leave_grant_without_employee_is_400(
    api_client_admin: APIClient, org: Organization
) -> None:
    """leave_grant.enabled without an employee block must return 400."""
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        default_days=Decimal("8"),
        accrual_type="annual",
    )
    body = {
        "email": "u@example.com",
        "role_code": "employee",
        "credential_method": "temp",
        "temp_password": "Temp!pass123",  # pragma: allowlist secret
        "leave_grant": {
            "enabled": True,
            "items": [
                {
                    "leave_type_id": str(lt.id),
                    "days_per_year": "8",
                    "permanent": False,
                }
            ],
        },
    }
    r = api_client_admin.post("/api/v1/users/", body, format="json")
    assert r.status_code == 400, r.content
