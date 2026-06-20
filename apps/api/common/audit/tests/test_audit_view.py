"""Integration tests for GET /api/v1/audit/logs."""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
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
    auditor = User.objects.create_user(
        email="aud@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    finance = User.objects.create_user(
        email="fin@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    employee = User.objects.create_user(
        email="emp@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    aud_role = Role.objects.create(org_id=org.id, code="auditor", name="Aud", is_system=False)
    fin_role = Role.objects.create(org_id=org.id, code="finance", name="Fin", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=False)
    UserRole.objects.create(user=auditor, role=aud_role)
    UserRole.objects.create(user=finance, role=fin_role)
    UserRole.objects.create(user=employee, role=emp_role)
    _grant(aud_role, "audit:read:org")  # no salary/bank read
    _grant(fin_role, "audit:read:org", "employee:salary:read", "employee:bank:read")
    _grant(emp_role, "employee:read:self")

    AuditLog.objects.create(
        org_id=org.id,
        actor_id=auditor.id,
        action="approve",
        entity="leave_request",
        entity_id=uuid.uuid4(),
        after={"status": "approved"},
    )
    AuditLog.objects.create(
        org_id=org.id,
        actor_id=finance.id,
        action="salary.update",
        entity="employee",
        entity_id=uuid.uuid4(),
        before={"salary": 4000, "title": "Exec"},
        after={"salary": 5000, "title": "Manager"},
    )
    return {"org": org}


@pytest.mark.django_db
def test_auditor_lists_logs(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'aud@x.com')}")
    resp = client.get("/api/v1/audit/logs")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["count"] == 2
    assert {"approve", "salary.update"} <= {r["action"] for r in body["results"]}
    assert "employee" in body["entities"]


@pytest.mark.django_db
def test_salary_redacted_without_perm(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'aud@x.com')}")
    rows = client.get("/api/v1/audit/logs").json()["results"]
    salary_row = next(r for r in rows if r["action"] == "salary.update")
    assert salary_row["after"]["salary"] == "•••••"
    assert salary_row["after"]["title"] == "Manager"  # non-sensitive shown


@pytest.mark.django_db
def test_salary_visible_with_perm(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'fin@x.com')}")
    rows = client.get("/api/v1/audit/logs").json()["results"]
    salary_row = next(r for r in rows if r["action"] == "salary.update")
    assert salary_row["after"]["salary"] == 5000


@pytest.mark.django_db
def test_filter_by_entity(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'aud@x.com')}")
    resp = client.get("/api/v1/audit/logs?entity=employee")
    body = resp.json()
    assert body["count"] == 1
    assert body["results"][0]["entity"] == "employee"


@pytest.mark.django_db
def test_csv_export(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'aud@x.com')}")
    resp = client.get("/api/v1/audit/logs?export=csv")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "text/csv"
    assert b"timestamp,actor,action" in resp.content


@pytest.mark.django_db
def test_employee_without_perm_forbidden(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'emp@x.com')}")
    assert client.get("/api/v1/audit/logs").status_code == 403
