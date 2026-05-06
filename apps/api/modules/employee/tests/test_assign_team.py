"""Endpoint tests for the perm-narrow PATCH path on /api/v1/employees/{id}/.

Holders of `employee:assign:team` (no `employee:write:org`) may PATCH only
the `team` field. Mixed-write or non-team field PATCHes get 403.
"""

from __future__ import annotations

import os

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee, Team
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


@pytest.fixture
def team(org: Organization) -> Team:
    return Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)


def _employee(org: Organization, dept: Department) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-100",
        first_name="Wei",
        last_name="Lin",
        email="wei@example.com",
        phone="+60123456789",
        date_of_birth="1992-03-15",
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="1 Jalan Provintell",
        city="PJ",
        state="Selangor",
        postcode="46050",
        country_code="MY",
        department=dept,
        role_title="Senior Engineer",
        employment_type="fulltime",
        hire_date="2024-06-01",
        bank_name="Maybank",
        emergency_contact_name="Mom",
        emergency_contact_relationship="mother",
        emergency_contact_phone="+60123456788",
    )


def _team_lead_client(org: Organization) -> APIClient:
    user = User.objects.create_user(
        email="lead@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="team_lead", name="Team Lead", is_system=True)
    for code in ("employee:read:team", "employee:assign:team"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "lead@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


@pytest.mark.django_db
def test_team_lead_can_patch_team_only(org, dept, team):
    """team_lead with employee:assign:team can PATCH {team: <id>}."""
    client = _team_lead_client(org)
    emp = _employee(org, dept)

    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"team": str(team.id)},
        format="json",
    )
    assert resp.status_code == 200, resp.content

    emp.refresh_from_db()
    assert emp.team_id == team.id


@pytest.mark.django_db
def test_team_lead_cannot_mix_team_and_other_fields(org, dept, team):
    """PATCH {team, role_title} → 403 (mixed write rejected)."""
    client = _team_lead_client(org)
    emp = _employee(org, dept)

    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"team": str(team.id), "role_title": "Lead Engineer"},
        format="json",
    )
    assert resp.status_code == 403, resp.content

    emp.refresh_from_db()
    assert emp.role_title == "Senior Engineer"  # unchanged


@pytest.mark.django_db
def test_team_lead_cannot_patch_non_team_field(org, dept):
    """PATCH {role_title} → 403."""
    client = _team_lead_client(org)
    emp = _employee(org, dept)

    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"role_title": "Lead Engineer"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_team_lead_can_clear_team(org, dept, team):
    """PATCH {team: null} is still in the narrow scope and allowed."""
    client = _team_lead_client(org)
    emp = _employee(org, dept)
    emp.team = team
    emp.save(update_fields=["team", "updated_at"])

    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"team": None},
        format="json",
    )
    assert resp.status_code == 200, resp.content

    emp.refresh_from_db()
    assert emp.team_id is None


@pytest.mark.django_db
def test_team_lead_can_retrieve_employee_for_form_prefill(org, dept):
    """Holders of employee:assign:team can GET /employees/{id}/ so the v1.6.0
    edit form pre-fills the read-only fields (v1.6.1). Without this, the
    narrow-PATCH UI flow breaks: team_lead/manager opens the edit page and
    sees an empty form because retrieve 403s."""
    client = _team_lead_client(org)
    emp = _employee(org, dept)

    resp = client.get(f"/api/v1/employees/{emp.id}/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["first_name"] == "Wei"
    # Encrypted fields stay hidden (write_only on the serializer); only
    # the non-secret fields and *_last4 masks come through.
    assert "ic_number" not in body
    assert "bank_account_number" not in body
