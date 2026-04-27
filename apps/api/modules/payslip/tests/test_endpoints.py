"""Integration tests for /api/v1/payslips/* + /api/v1/payroll/* endpoints."""

from __future__ import annotations

import datetime
import os
import uuid
from decimal import Decimal
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.payslip.models import PayrollPeriod, PayrollRun, PayslipRecord


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},
        format="json",
    ).json()
    return body["access_token"]


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _make_emp(org, dept, user):
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=f"PVT-{str(uuid.uuid4())[:4]}",
        user=user,
        first_name="T",
        last_name="E",
        email=user.email,
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
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


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

    hr_role = Role.objects.create(org_id=org.id, code="hr", name="HR", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=False)

    UserRole.objects.create(user=hr_user, role=hr_role)
    UserRole.objects.create(user=emp_user, role=emp_role)

    _grant(
        hr_role,
        "payslip:read:self",
        "payslip:read:org",
        "payroll:run:create",
        "payroll:run:publish",
        "payroll:period:write",
    )
    _grant(emp_role, "payslip:read:self")

    hr_emp = _make_emp(org, dept, hr_user)
    employee = _make_emp(org, dept, emp_user)

    period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    payslip = PayslipRecord.all_objects.create(
        org_id=org.id,
        employee_id=employee.id,
        period=period,
        gross=Decimal("5000"),
        net=Decimal("4250"),
        currency_code="MYR",
        source="csv_import",
        status="published",
        components={"basic_salary": "5000"},
        deductions={"epf": "550", "pcb": "200"},
    )
    return org, dept, hr_user, emp_user, hr_emp, employee, period, payslip


@pytest.mark.django_db
def test_list_periods(stack):
    org, dept, hr_user, *_ = stack
    client = APIClient()
    token = _login(client, "hr@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/payroll/periods/")
    assert resp.status_code == 200
    data = resp.json()
    results = data if isinstance(data, list) else data.get("results", data)
    assert len(results) >= 1


@pytest.mark.django_db
def test_employee_list_own_payslips(stack):
    *_, emp_user, _, employee, period, payslip = stack
    client = APIClient()
    token = _login(client, "emp@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/payslips/me/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == str(payslip.id)


@pytest.mark.django_db
def test_retrieve_payslip(stack):
    *_, employee, period, payslip = stack
    client = APIClient()
    token = _login(client, "hr@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get(f"/api/v1/payslips/{payslip.id}/")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(payslip.id)


@pytest.mark.django_db
def test_upload_csv_run(stack):
    org, dept, hr_user, *_ = stack
    employee = stack[5]  # the Employee object
    emp_code = employee.employee_code
    client = APIClient()
    token = _login(client, "hr@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # Use a fresh period not used by the fixture payslip
    new_period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 7, 1),
        period_end=datetime.date(2026, 7, 31),
        period_type="monthly",
        pay_date=datetime.date(2026, 8, 5),
    )

    # Build CSV using proper double-quote escaping (RFC 4180: "" inside quoted field)
    csv_content = (
        "employee_code,gross,net,components_json,deductions_json\r\n"
        f"{emp_code},5000.00,4250.00,"
        '"{""basic"":5000}",'
        '"{""epf"":550,""pcb"":200}"\r\n'
    )
    csv_file = BytesIO(csv_content.encode())
    csv_file.name = "payroll.csv"

    resp = client.post(
        "/api/v1/payroll/runs/",
        {"period": str(new_period.id), "csv": csv_file},
        format="multipart",
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "run_id" in data
    assert data["row_count"] == 1


@pytest.mark.django_db
def test_preview_run(stack):
    org, dept, hr_user, *_, period, _ = stack
    run = PayrollRun.all_objects.create(
        org_id=org.id,
        period=period,
        uploaded_by=hr_user.id,
        status="validated",
        row_count=1,
    )
    client = APIClient()
    token = _login(client, "hr@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.post(f"/api/v1/payroll/runs/{run.id}/preview/")
    assert resp.status_code == 200
    assert "row_count" in resp.json()
    assert "errors" in resp.json()
    assert "first_5_payslips" in resp.json()


@pytest.mark.django_db
def test_publish_run(stack):
    org, dept, hr_user, *_, period, payslip = stack
    payslip.status = "draft"
    payslip.save()
    run = PayrollRun.all_objects.create(
        org_id=org.id,
        period=period,
        uploaded_by=hr_user.id,
        status="validated",
        row_count=1,
    )
    client = APIClient()
    token = _login(client, "hr@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    mock_s3 = MagicMock()
    with patch("modules.payslip.services.publish._s3", return_value=mock_s3):
        resp = client.post(f"/api/v1/payroll/runs/{run.id}/publish/")
    assert resp.status_code == 200
    assert resp.json()["published"] == 1
