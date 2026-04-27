"""Integration tests for /api/v1/leave/* endpoints."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()
    return body["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )

    mgr_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in (
        "leave:request:read:self",
        "leave:request:read:team",
        "leave:request:approve:team",
        "leave:balance:read:self",
    ):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)
    for code in (
        "leave:request:create:self",
        "leave:request:read:self",
        "leave:request:cancel:self",
        "leave:balance:read:self",
    ):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)
    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)
    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)

    def _emp(code, user, manager=None):
        return Employee.all_objects.create(
            org_id=org.id,
            user=user,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=datetime.date(1985, 1, 1),
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
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    mgr_emp = _emp("MGR", mgr_user)
    emp_emp = _emp("EMP", emp_user, manager=mgr_emp)

    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )

    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'emp@x.com')}")
    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'mgr@x.com')}")

    return org, dept, lt, emp_user, mgr_user, emp_emp, mgr_emp, emp_client, mgr_client


@pytest.mark.django_db
def test_get_leave_types(stack) -> None:
    *_, emp_client, _ = stack
    resp = emp_client.get("/api/v1/leave/types/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    assert any(r["code"] == "ANNUAL" for r in rows)


@pytest.mark.django_db
def test_get_my_balances(stack) -> None:
    *_, emp_client, _ = stack
    resp = emp_client.get("/api/v1/leave/balances/me/")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)
    assert any(r["leave_type_code"] == "ANNUAL" for r in rows)


@pytest.mark.django_db
def test_apply_submit_approve_flow(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, mgr_client = stack
    # 1. Create draft request
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id),
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "total_days": "3",
            "is_half_day": False,
            "reason": "Family trip",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    req_id = resp.json()["id"]

    # 2. Submit
    resp = emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"

    # 3. Manager approves
    resp = mgr_client.post(
        f"/api/v1/leave/requests/{req_id}/approve/",
        {"comment": "Enjoy"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "approved"


@pytest.mark.django_db
def test_reject_requires_comment(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, mgr_client = stack
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id),
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "total_days": "3",
            "is_half_day": False,
            "reason": "x",
        },
        format="json",
    )
    req_id = resp.json()["id"]
    emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")

    # Reject without comment
    resp = mgr_client.post(f"/api/v1/leave/requests/{req_id}/reject/", {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_employee_cannot_approve_own_request(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, _ = stack
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id),
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "total_days": "3",
            "is_half_day": False,
            "reason": "x",
        },
        format="json",
    )
    req_id = resp.json()["id"]
    emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")

    resp = emp_client.post(f"/api/v1/leave/requests/{req_id}/approve/", {}, format="json")
    # 403 because employee role doesn't have leave:request:approve:team
    assert resp.status_code == 403
