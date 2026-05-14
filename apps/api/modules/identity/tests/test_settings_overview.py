"""Tests for /api/v1/admin/settings-overview/ (v1.9.0)."""

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
        name="Prov",
        slug="prov-overview",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    set_current_org_id(o.id)
    return o


@pytest.fixture
def dept(org) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


def _setup_user(org: Organization, perms: list[str]) -> APIClient:
    user = User.objects.create_user(
        email="ad@example.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="r-ov", name="OvRole", is_system=False)
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "ad@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


def _make_emp(org, dept, code: str, user=None, deleted=False) -> Employee:
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=code,
        last_name="X",
        email=f"{code.lower()}@x.com",
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


@pytest.mark.django_db
def test_overview_returns_expected_shape(org, dept) -> None:
    _make_emp(org, dept, "A")
    arch = _make_emp(org, dept, "B")
    arch.delete()
    User.objects.create_user(
        email="orphan@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    client = _setup_user(org, ["role:read"])
    resp = client.get("/api/v1/admin/settings-overview/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert set(body.keys()) == {"stats", "attention", "recent_activity"}
    assert body["stats"]["employees_active"] >= 1
    assert body["stats"]["employees_archived"] >= 1
    assert body["stats"]["departments"] >= 1
    assert body["attention"]["unlinked_users_count"] >= 1


@pytest.mark.django_db
def test_overview_filters_recent_activity_to_admin_actions(org) -> None:
    import uuid as _uuid

    AuditLog.objects.create(
        org_id=org.id,
        action="leave_type.created",
        entity="leave_type",
        entity_id=_uuid.uuid4(),
        after={"name": "VacationLT"},
    )
    AuditLog.objects.create(
        org_id=org.id,
        action="leave_request.submitted",  # NOT admin
        entity="leave_request",
        entity_id=_uuid.uuid4(),
        after={},
    )
    client = _setup_user(org, ["role:read"])
    resp = client.get("/api/v1/admin/settings-overview/")
    actions = [a["action"] for a in resp.json()["recent_activity"]]
    assert "leave_type.created" in actions
    assert "leave_request.submitted" not in actions


@pytest.mark.django_db
def test_overview_requires_role_read(org) -> None:
    client = _setup_user(org, ["employee:read:org"])  # no role:read
    resp = client.get("/api/v1/admin/settings-overview/")
    assert resp.status_code == 403


# ---- v1.9.2 additions: M2 cache + L7 audit-log writes ----


@pytest.mark.django_db
def test_overview_writes_audit_log_on_view(org) -> None:
    """L7: every successful Overview view writes one audit log row."""
    client = _setup_user(org, ["role:read"])
    before = AuditLog.objects.filter(action="admin.overview_viewed").count()
    client.get("/api/v1/admin/settings-overview/")
    after = AuditLog.objects.filter(action="admin.overview_viewed").count()
    assert after == before + 1


@pytest.mark.django_db
def test_overview_cache_returns_stable_payload_within_ttl(org, dept) -> None:
    """M2: a second GET within the TTL window returns the cached payload
    (verified by adding a new employee and confirming the count doesn't
    move on the second call)."""
    import datetime

    from django.core.cache import cache

    cache.clear()  # isolate from other tests
    _make_emp(org, dept, "BEFORE")
    client = _setup_user(org, ["role:read"])
    first = client.get("/api/v1/admin/settings-overview/").json()
    first_count = first["stats"]["employees_active"]

    # Mutate underneath the cache; second call should still return cached.
    Employee.all_objects.create(
        org_id=org.id,
        employee_code="MUTATE",
        first_name="Mu",
        last_name="X",
        email="mu@x.com",
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
    )
    second = client.get("/api/v1/admin/settings-overview/").json()
    assert second["stats"]["employees_active"] == first_count
