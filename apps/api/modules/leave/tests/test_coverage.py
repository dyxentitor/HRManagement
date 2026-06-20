"""Integration tests for GET /api/v1/leave/coverage."""

from __future__ import annotations

import datetime
import uuid

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import LeaveRequest, LeaveType
from modules.organization.models import Department, Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _login(client, email, password="x"):  # pragma: allowlist secret
    return client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()["access_token"]


def _emp(org, dept, code, user=None, manager=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="T",
        email=f"{code.lower()}@x.com",
        hire_date=datetime.date(2024, 1, 1),
        employment_type="fulltime",
        department=dept,
        manager=manager,
    )


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
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    lt = LeaveType.all_objects.create(org_id=org.id, code="ANNUAL", name="Annual", is_paid=True)

    mgr_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    p1_user = User.objects.create_user(
        email="p1@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    mgr_role = Role.objects.create(org_id=org.id, code="mgr", name="Mgr", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="emp", name="Emp", is_system=False)
    UserRole.objects.create(user=mgr_user, role=mgr_role)
    UserRole.objects.create(user=p1_user, role=emp_role)
    _grant(mgr_role, "leave:request:read:team")
    _grant(emp_role, "leave:request:read:self")

    manager = _emp(org, dept, "MGR", user=mgr_user)
    p1 = _emp(org, dept, "P1", user=p1_user, manager=manager)
    p2 = _emp(org, dept, "P2", manager=manager)

    # P2 is on approved leave 24-25 Jun 2026 (overlaps the window).
    LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=p2.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 24),
        end_date=datetime.date(2026, 6, 25),
        total_days="2",
        status="approved",
    )
    return {"org": org, "p1": p1, "p2": p2}


@pytest.mark.django_db
def test_manager_sees_coverage_names(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'mgr@x.com')}")
    resp = client.get(
        f"/api/v1/leave/coverage?start=2026-06-22&end=2026-06-28&employee_id={stack['p1'].id}"
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["team_size"] == 1  # just P2 (P1 excluded as the target)
    assert body["per_day"]["2026-06-24"] == 1
    assert body["per_day"]["2026-06-25"] == 1
    assert body["people"][0]["name"] == "P2 T"
    assert body["people"][0]["leave_type_code"] == "ANNUAL"


@pytest.mark.django_db
def test_employee_sees_counts_not_names(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'p1@x.com')}")
    resp = client.get("/api/v1/leave/coverage?start=2026-06-22&end=2026-06-28")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["per_day"]["2026-06-24"] == 1  # counts visible
    assert body["people"] == []  # names redacted without read:team


@pytest.mark.django_db
def test_missing_params_400(stack):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'p1@x.com')}")
    assert client.get("/api/v1/leave/coverage").status_code == 400
