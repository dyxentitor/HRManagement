"""v1.8.0 endpoint tests: LeavePolicy CRUD, EmployeeLeaveOverride, admin accrue, /me breakdown."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import EmployeeLeaveOverride, LeaveBalance, LeaveType
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
        default_days=Decimal("8"),
    )

    hr_user = User.objects.create_user(
        email="hr@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    hr_role = Role.objects.create(org_id=org.id, code="hr", name="HR", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in (
        "leave:type:write",
        "leave:policy:write",
        "leave:balance:adjust:org",
        "leave:request:read:self",
        "leave:balance:read:self",
    ):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=hr_role, permission=p)
    for code in (
        "leave:request:create:self",
        "leave:request:read:self",
        "leave:balance:read:self",
    ):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)
    UserRole.objects.create(user=hr_user, role=hr_role, granted_by=None)
    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)

    def _emp(code, user):
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
            role_title="x",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    hr_emp = _emp("HR", hr_user)
    emp_emp = _emp("EMP", emp_user)

    hr_client = APIClient()
    hr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(hr_client, 'hr@x.com')}")
    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'emp@x.com')}")

    return {
        "org": org,
        "lt": lt,
        "hr_emp": hr_emp,
        "emp_emp": emp_emp,
        "hr_client": hr_client,
        "emp_client": emp_client,
    }


# --- LeavePolicyViewSet -------------------------------------------------------


@pytest.mark.django_db
def test_hr_can_create_policy(stack) -> None:
    body = {
        "leave_type": str(stack["lt"].id),
        "days_per_year": "8",
        "tenure_brackets": [
            {"min_years": 0, "days": 8},
            {"min_years": 2, "days": 12},
        ],
        "effective_from": "2026-01-01",
    }
    resp = stack["hr_client"].post("/api/v1/leave/policies/", body, format="json")
    assert resp.status_code == 201, resp.json()


@pytest.mark.django_db
def test_brackets_validated_ascending(stack) -> None:
    body = {
        "leave_type": str(stack["lt"].id),
        "days_per_year": "8",
        "tenure_brackets": [
            {"min_years": 5, "days": 16},
            {"min_years": 0, "days": 8},  # not ascending
        ],
        "effective_from": "2026-01-01",
    }
    resp = stack["hr_client"].post("/api/v1/leave/policies/", body, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_employee_cannot_write_policy(stack) -> None:
    body = {
        "leave_type": str(stack["lt"].id),
        "days_per_year": "8",
        "effective_from": "2026-01-01",
    }
    resp = stack["emp_client"].post("/api/v1/leave/policies/", body, format="json")
    assert resp.status_code == 403


# --- EmployeeLeaveOverrideViewSet ---------------------------------------------


@pytest.mark.django_db
def test_hr_can_create_override(stack) -> None:
    body = {
        "leave_type": str(stack["lt"].id),
        "days_override": "21",
        "effective_from": "2026-01-01",
        "note": "Senior offer letter",
        "employee_id": str(stack["emp_emp"].id),
    }
    resp = stack["hr_client"].post("/api/v1/leave/employee-overrides/", body, format="json")
    assert resp.status_code == 201, resp.json()


@pytest.mark.django_db
def test_self_can_read_own_overrides(stack) -> None:
    EmployeeLeaveOverride.all_objects.create(
        org_id=stack["org"].id,
        employee_id=stack["emp_emp"].id,
        leave_type=stack["lt"],
        days_override=Decimal("21"),
        effective_from=datetime.date(2026, 1, 1),
    )
    resp = stack["emp_client"].get(
        f"/api/v1/leave/employee-overrides/?employee={stack['emp_emp'].id}"
    )
    assert resp.status_code == 200
    rows = resp.json()
    rows = rows["results"] if isinstance(rows, dict) else rows
    assert len(rows) == 1


@pytest.mark.django_db
def test_self_cannot_write_override(stack) -> None:
    body = {
        "leave_type": str(stack["lt"].id),
        "days_override": "30",
        "effective_from": "2026-01-01",
        "employee_id": str(stack["emp_emp"].id),
    }
    resp = stack["emp_client"].post("/api/v1/leave/employee-overrides/", body, format="json")
    assert resp.status_code == 403


# --- AdminAccrualViewSet ------------------------------------------------------


@pytest.mark.django_db
def test_admin_accrue_dry_run(stack) -> None:
    resp = stack["hr_client"].post(
        "/api/v1/admin/leave/accrue/",
        {"year": 2026, "dry_run": True},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "granted" in body and "skipped" in body and "errors" in body


@pytest.mark.django_db
def test_admin_accrue_employee_forbidden(stack) -> None:
    resp = stack["emp_client"].post(
        "/api/v1/admin/leave/accrue/",
        {"year": 2026, "dry_run": True},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_admin_carry_forward_dry_run(stack) -> None:
    resp = stack["hr_client"].post(
        "/api/v1/admin/leave/carry-forward/",
        {"year": 2025, "dry_run": True},
        format="json",
    )
    assert resp.status_code == 200


# --- /me breakdown payload (v1.8.0 fields) ------------------------------------


@pytest.mark.django_db
def test_me_payload_includes_carried_expiry_and_ledger_recent(stack) -> None:
    LeaveBalance.all_objects.create(
        org_id=stack["org"].id,
        employee_id=stack["emp_emp"].id,
        leave_type=stack["lt"],
        year=2026,
        entitled=Decimal("16"),
        carried_forward=Decimal("2"),
        carried_forward_expires_at=datetime.date(2027, 4, 1),
        taken=Decimal("4"),
    )
    resp = stack["emp_client"].get("/api/v1/leave/balances/me/")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)
    assert len(rows) >= 1
    row = rows[0]
    assert "carried_forward_expires_at" in row
    assert "ledger_recent" in row
    assert row["entitled"] == "16.00"


# --- LeaveTypeViewSet write actions (v1.8.0) ---------------------------------


@pytest.mark.django_db
def test_hr_can_patch_leave_type_with_v18_fields(stack) -> None:
    resp = stack["hr_client"].patch(
        f"/api/v1/leave/types/{stack['lt'].id}/",
        {
            "carry_forward_expiry_months": 12,
            "max_per_lifetime_events": 5,
        },
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["carry_forward_expiry_months"] == 12


@pytest.mark.django_db
def test_employee_cannot_patch_leave_type(stack) -> None:
    resp = stack["emp_client"].patch(
        f"/api/v1/leave/types/{stack['lt'].id}/",
        {"name": "Hacked"},
        format="json",
    )
    assert resp.status_code == 403
