"""Tests for v1.9.0 admin link-manager endpoints + link-user/unlink-user actions."""

from __future__ import annotations

import datetime

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from common.managers import set_current_org_id
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture
def org() -> Organization:
    o = Organization.objects.create(
        name="Provintell",
        slug="provintell-link",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    set_current_org_id(o.id)
    return o


@pytest.fixture
def other_org() -> Organization:
    return Organization.objects.create(
        name="Other",
        slug="other-link",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


def _setup_user(
    org: Organization, perm_codes: list[str], email: str = "admin@example.com"
) -> APIClient:
    user = User.objects.create_user(
        email=email,
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="r-link", name="LinkRole", is_system=False)
    for code in perm_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


def _make_emp(org, dept, code: str, email: str, user=None, deleted: bool = False) -> Employee:
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=code,
        last_name="X",
        email=email,
        phone="+60123456789",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="KL",
        state="KL",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Maybank",
        emergency_contact_name="X",
        emergency_contact_relationship="father",
        emergency_contact_phone="+60123456789",
        status="active",
        user=user,
    )
    if deleted:
        emp.delete()
    return emp


# ---------- unlinked-users ----------


@pytest.mark.django_db
def test_unlinked_users_returns_users_without_employee(org, dept) -> None:
    User.objects.create_user(
        email="jane@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    linked = User.objects.create_user(  # pragma: allowlist secret
        email="bob@x.com", password="x", org_id=org.id
    )
    _make_emp(org, dept, "BOB", email="bob@x.com", user=linked)

    client = _setup_user(org, ["employee:write:org"])
    resp = client.get("/api/v1/admin/unlinked-users/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    rows = body["results"] if isinstance(body, dict) and "results" in body else body
    emails = [u["email"] for u in rows]
    assert "jane@x.com" in emails
    assert "bob@x.com" not in emails


@pytest.mark.django_db
def test_unlinked_users_auto_suggest_by_email_match(org, dept) -> None:
    User.objects.create_user(
        email="jane@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    _make_emp(org, dept, "JANE", email="jane@x.com")

    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-users/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    jane = next(u for u in rows if u["email"] == "jane@x.com")
    assert jane["suggested_employee"] is not None
    assert jane["suggested_employee"]["email"] == "jane@x.com"


@pytest.mark.django_db
def test_unlinked_users_no_suggestion_when_no_match(org) -> None:
    User.objects.create_user(
        email="jane@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-users/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    jane = next(u for u in rows if u["email"] == "jane@x.com")
    assert jane["suggested_employee"] is None


@pytest.mark.django_db
def test_unlinked_users_case_insensitive_match(org, dept) -> None:
    User.objects.create_user(
        email="Jane@X.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    _make_emp(org, dept, "JANE", email="jane@x.com")
    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-users/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    jane = next(u for u in rows if u["email"].lower() == "jane@x.com")
    assert jane["suggested_employee"] is not None


@pytest.mark.django_db
def test_unlinked_users_requires_perm(org) -> None:
    client = _setup_user(org, ["employee:read:org"])  # no write
    resp = client.get("/api/v1/admin/unlinked-users/")
    assert resp.status_code == 403


# ---------- unlinked-employees ----------


@pytest.mark.django_db
def test_unlinked_employees_returns_employees_without_user(org, dept) -> None:
    _make_emp(org, dept, "NOUSER", email="nou@x.com", user=None)
    bob = User.objects.create_user(
        email="b@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    _make_emp(org, dept, "BOB", email="b@x.com", user=bob)

    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-employees/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    names = [e["email"] for e in rows]
    assert "nou@x.com" in names
    assert "b@x.com" not in names


@pytest.mark.django_db
def test_unlinked_employees_auto_suggest_user(org, dept) -> None:
    User.objects.create_user(
        email="match@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    _make_emp(org, dept, "MATCH", email="match@x.com", user=None)
    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-employees/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    row = next(e for e in rows if e["email"] == "match@x.com")
    assert row["suggested_user"] is not None
    assert row["suggested_user"]["email"] == "match@x.com"


@pytest.mark.django_db
def test_unlinked_employees_excludes_archived(org, dept) -> None:
    _make_emp(org, dept, "ARCH", email="arch@x.com", user=None, deleted=True)
    client = _setup_user(org, ["employee:write:org"])
    rows = client.get("/api/v1/admin/unlinked-employees/").json()
    rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
    assert all(e["email"] != "arch@x.com" for e in rows)


# ---------- link-user / unlink-user ----------


@pytest.mark.django_db
def test_link_user_writes_user_id(org, dept) -> None:
    u = User.objects.create_user(
        email="jane@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp = _make_emp(org, dept, "JANE", email="jane@x.com", user=None)
    client = _setup_user(org, ["employee:write:org"])
    resp = client.post(
        f"/api/v1/employees/{emp.id}/link-user/", {"user_id": str(u.id)}, format="json"
    )
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.user_id == u.id


@pytest.mark.django_db
def test_link_user_rejects_cross_org_user(org, other_org, dept) -> None:
    cross = User.objects.create_user(
        email="x@x.com", password="x", org_id=other_org.id
    )  # pragma: allowlist secret
    emp = _make_emp(org, dept, "X", email="x@x.com", user=None)
    client = _setup_user(org, ["employee:write:org"])
    resp = client.post(
        f"/api/v1/employees/{emp.id}/link-user/", {"user_id": str(cross.id)}, format="json"
    )
    assert resp.status_code in (400, 404)


@pytest.mark.django_db
def test_link_user_rejects_already_linked_user(org, dept) -> None:
    u = User.objects.create_user(
        email="dup@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    _make_emp(org, dept, "FIRST", email="dup@x.com", user=u)
    other_emp = _make_emp(org, dept, "OTHER", email="o@x.com", user=None)
    client = _setup_user(org, ["employee:write:org"])
    resp = client.post(
        f"/api/v1/employees/{other_emp.id}/link-user/",
        {"user_id": str(u.id)},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_link_user_writes_audit_log(org, dept) -> None:
    u = User.objects.create_user(
        email="a@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp = _make_emp(org, dept, "A", email="a@x.com", user=None)
    client = _setup_user(org, ["employee:write:org"])
    client.post(f"/api/v1/employees/{emp.id}/link-user/", {"user_id": str(u.id)}, format="json")
    log = AuditLog.objects.filter(action="employee.user_linked", entity_id=emp.id).first()
    assert log is not None
    after = log.after or {}
    assert after.get("user_id") == str(u.id)
    assert after.get("suggested") is True  # email match


@pytest.mark.django_db
def test_unlink_user_clears_user_id(org, dept) -> None:
    u = User.objects.create_user(
        email="b@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp = _make_emp(org, dept, "B", email="b@x.com", user=u)
    client = _setup_user(org, ["employee:write:org"])
    resp = client.delete(f"/api/v1/employees/{emp.id}/link-user/")
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.user_id is None


@pytest.mark.django_db
def test_unlink_user_writes_audit_log(org, dept) -> None:
    u = User.objects.create_user(
        email="c@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp = _make_emp(org, dept, "C", email="c@x.com", user=u)
    client = _setup_user(org, ["employee:write:org"])
    client.delete(f"/api/v1/employees/{emp.id}/link-user/")
    log = AuditLog.objects.filter(action="employee.user_unlinked", entity_id=emp.id).first()
    assert log is not None
    assert (log.before or {}).get("user_id") == str(u.id)
