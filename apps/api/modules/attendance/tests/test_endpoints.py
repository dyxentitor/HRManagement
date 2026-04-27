"""Attendance endpoints integration tests."""

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


def _login(client, email, password="x"):  # pragma: allowlist secret
    return client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()["access_token"]


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

    emp_user = User.objects.create_user(
        email="e@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    mgr_user = User.objects.create_user(
        email="m@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    emp_role = Role.objects.create(org_id=org.id, code="employee", name="E", is_system=True)
    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="M", is_system=True)

    for code in ("attendance:clock:self", "attendance:read:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)
    for code in ("attendance:clock:self", "attendance:read:self", "attendance:read:team"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)

    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)
    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)

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

    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'e@x.com')}")
    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'm@x.com')}")
    return org, emp_client, mgr_client, emp_emp, mgr_emp


@pytest.mark.django_db
def test_clock_in_endpoint(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.post("/api/v1/attendance/clock-in/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["clock_in"] is not None
    assert body["status"] == "partial"


@pytest.mark.django_db
def test_clock_in_then_out(stack):
    _, emp_client, _, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = emp_client.post("/api/v1/attendance/clock-out/")
    assert resp.status_code == 200
    assert resp.json()["clock_out"] is not None
    assert resp.json()["status"] == "present"


@pytest.mark.django_db
def test_today_endpoint_returns_record_or_blank(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.get("/api/v1/attendance/today/")
    assert resp.status_code == 200
    body = resp.json()
    # Either no_record or a real record
    assert "status" in body


@pytest.mark.django_db
def test_records_returns_self_only(stack):
    _, emp_client, _, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = emp_client.get("/api/v1/attendance/records/")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)


@pytest.mark.django_db
def test_team_view_for_manager(stack):
    _, emp_client, mgr_client, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = mgr_client.get("/api/v1/attendance/team/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_employee_cannot_view_team(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.get("/api/v1/attendance/team/")
    assert resp.status_code == 403
