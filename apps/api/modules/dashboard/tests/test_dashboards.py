"""Tests for dashboard card catalogue + /api/v1/dashboards/{me,team,admin} endpoints."""

from __future__ import annotations

import datetime
import os
import uuid

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
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _make_employee(code: str, user: User, org, dept, manager=None) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="Test",
        email=f"{code.lower()}@dash.com",
        phone="+600",
        date_of_birth=datetime.date(1990, 4, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="123 St",
        city="KL",
        state="WP",
        postcode="50000",
        country_code="MY",
        department=dept,
        manager=manager,
        role_title="Staff",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Bank",
        emergency_contact_name="EC",
        emergency_contact_relationship="parent",
        emergency_contact_phone="+601",
    )


def _grant(user: User, *codes: str) -> None:
    org_id = user.org_id
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        role_code = f"r_{uuid.uuid4().hex[:8]}"
        role = Role.objects.create(org_id=org_id, code=role_code, name=role_code, is_system=False)
        RolePermission.objects.create(role=role, permission=p)
        UserRole.objects.create(user=user, role=role, granted_by=None)


def _authed_client(user: User) -> APIClient:
    client = APIClient()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": user.email, "password": "pass"},  # pragma: allowlist secret
        format="json",
    )
    token = resp.json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="DashOrg",
        slug=f"dashorg-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Engineering")

    emp_user = User.objects.create_user(
        email=f"emp_{uuid.uuid4().hex[:6]}@dash.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    mgr_user = User.objects.create_user(
        email=f"mgr_{uuid.uuid4().hex[:6]}@dash.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    hr_user = User.objects.create_user(
        email=f"hr_{uuid.uuid4().hex[:6]}@dash.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    mgr_emp = _make_employee("MGR001", mgr_user, org, dept)
    _make_employee("EMP001", emp_user, org, dept, manager=mgr_emp)
    _make_employee("HR001", hr_user, org, dept)

    return org, emp_user, mgr_user, hr_user


@pytest.mark.django_db
def test_me_dashboard_returns_cards_for_employee(stack):
    """An employee with dashboard:read:me gets a 'me' dashboard with cards."""
    _, emp_user, _, _ = stack
    _grant(
        emp_user,
        "dashboard:read:me",
        "leave:balance:read:self",
        "schedule:holiday:read",
        "claim:read:self",
        "employee:read:org",
    )
    client = _authed_client(emp_user)
    resp = client.get("/api/v1/dashboards/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["variant"] == "me"
    assert isinstance(data["cards"], list)
    # me cards: my_leave_balance, upcoming_holidays, recent_claims_self, birthdays_this_month
    card_types = {c["type"] for c in data["cards"]}
    assert "my_leave_balance" in card_types
    assert "upcoming_holidays" in card_types
    assert "recent_claims_self" in card_types
    assert "birthdays_this_month" in card_types


@pytest.mark.django_db
def test_team_dashboard_returns_cards_for_manager(stack):
    """A manager with dashboard:read:team gets a 'team' dashboard."""
    _, _, mgr_user, _ = stack
    _grant(
        mgr_user,
        "dashboard:read:team",
        "approvals:inbox:read",
        "attendance:read:team",
        "cert:read:team",
        "kpi:assignment:read:team",
        "leave:balance:read:self",
        "schedule:holiday:read",
    )
    client = _authed_client(mgr_user)
    resp = client.get("/api/v1/dashboards/team")
    assert resp.status_code == 200
    data = resp.json()
    assert data["variant"] == "team"
    card_types = {c["type"] for c in data["cards"]}
    assert "pending_approvals" in card_types
    assert "today_attendance_team" in card_types


@pytest.mark.django_db
def test_admin_dashboard_denied_for_employee(stack):
    """An employee without dashboard:read:admin is denied the admin dashboard."""
    _, emp_user, _, _ = stack
    _grant(emp_user, "dashboard:read:me")
    client = _authed_client(emp_user)
    resp = client.get("/api/v1/dashboards/admin")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unknown_variant_returns_404(stack):
    """An unknown dashboard variant returns 404."""
    _, emp_user, _, _ = stack
    _grant(emp_user, "dashboard:read:me")
    client = _authed_client(emp_user)
    resp = client.get("/api/v1/dashboards/unknown_variant")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_cards_filtered_by_is_visible_for(stack):
    """Cards whose required_perms are missing are excluded from the response."""
    _, emp_user, _, _ = stack
    # Grant dashboard:read:me but NOT birthdays perm (employee:read:org)
    _grant(
        emp_user,
        "dashboard:read:me",
        "leave:balance:read:self",
        "schedule:holiday:read",
        "claim:read:self",
        # no employee:read:org → birthdays_this_month should be excluded
    )
    client = _authed_client(emp_user)
    resp = client.get("/api/v1/dashboards/me")
    assert resp.status_code == 200
    card_types = {c["type"] for c in resp.json()["cards"]}
    assert "birthdays_this_month" not in card_types
    assert "my_leave_balance" in card_types


@pytest.mark.django_db
def test_admin_dashboard_allowed_for_hr_user(stack):
    """An HR user with dashboard:read:admin can access the admin dashboard."""
    _, _, _, hr_user = stack
    _grant(
        hr_user,
        "dashboard:read:admin",
        "approvals:inbox:read",
        "attendance:read:team",
        "cert:read:team",
        "kpi:assignment:read:team",
        "employee:read:org",
        "schedule:holiday:read",
    )
    client = _authed_client(hr_user)
    resp = client.get("/api/v1/dashboards/admin")
    assert resp.status_code == 200
    data = resp.json()
    assert data["variant"] == "admin"
    assert len(data["cards"]) > 0
