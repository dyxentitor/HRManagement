"""Integration tests for /api/v1/payroll/exceptions/*."""

from __future__ import annotations

import datetime
import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization
from modules.payslip.models import PayrollException, PayrollPeriod


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},
        format="json",
    ).json()
    return body["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug=f"x-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    fin_user = User.objects.create_user(
        email="fin@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    fin_role = Role.objects.create(org_id=org.id, code="finance", name="Fin", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=False)
    UserRole.objects.create(user=fin_user, role=fin_role)
    UserRole.objects.create(user=emp_user, role=emp_role)
    _grant(fin_role, "payroll:exception:read", "payroll:exception:write")
    _grant(emp_role, "payslip:read:self")

    period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    return {"org": org, "fin_user": fin_user, "emp_user": emp_user, "period": period}


@pytest.mark.django_db
def test_finance_lists_open_exceptions(stack):
    org, period = stack["org"], stack["period"]
    PayrollException.all_objects.create(
        org_id=org.id, period=period, kind="missing_bank", message="No bank account", status="open"
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'fin@x.com')}")
    resp = client.get("/api/v1/payroll/exceptions/")
    assert resp.status_code == 200, resp.content
    rows = resp.json()
    rows = rows.get("results") if isinstance(rows, dict) else rows
    assert len(rows) == 1
    assert rows[0]["kind"] == "missing_bank"
    assert rows[0]["status"] == "open"


@pytest.mark.django_db
def test_finance_resolves_exception(stack):
    org, period = stack["org"], stack["period"]
    exc = PayrollException.all_objects.create(
        org_id=org.id, period=period, kind="negative_net", message="Net < 0", status="open"
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'fin@x.com')}")
    resp = client.patch(f"/api/v1/payroll/exceptions/{exc.id}/resolve/")
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "resolved"
    exc.refresh_from_db()
    assert exc.status == "resolved"
    assert exc.resolved_by == stack["fin_user"].id
    assert exc.resolved_at is not None


@pytest.mark.django_db
def test_employee_cannot_read_exceptions(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'emp@x.com')}")
    resp = client.get("/api/v1/payroll/exceptions/")
    assert resp.status_code == 403
