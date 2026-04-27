"""Integration tests for /api/v1/kpi/* endpoints."""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.kpi.models import KpiAssignment, KpiCycle, KpiDefinition, KpiTemplate
from modules.organization.models import Organization


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},  # pragma: allowlist secret
        format="json",
    ).json()
    return body["access_token"]


def _grant(role: Role, *codes: str) -> None:
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="KPI Corp",
        slug="kpi-corp",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    hr_role = Role.objects.create(org_id=org.id, code="hr", name="HR", is_system=True)
    _grant(
        hr_role,
        "kpi:cycle:read",
        "kpi:cycle:write",
        "kpi:template:read",
        "kpi:template:write",
        "kpi:assignment:read:self",
        "kpi:assignment:read:team",
        "kpi:assignment:write:team",
        "kpi:review:write:self",
        "kpi:review:write:team",
    )
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=True)
    _grant(
        emp_role,
        "kpi:assignment:read:self",
        "kpi:review:write:self",
    )

    hr_user = User.objects.create_user(
        email="hr@kpi.test",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    UserRole.objects.create(user=hr_user, role=hr_role)

    emp_user = User.objects.create_user(
        email="emp@kpi.test",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    UserRole.objects.create(user=emp_user, role=emp_role)

    client = APIClient()
    hr_token = _login(client, "hr@kpi.test")
    emp_token = _login(client, "emp@kpi.test")

    return {
        "org": org,
        "hr_user": hr_user,
        "emp_user": emp_user,
        "client": client,
        "hr_token": hr_token,
        "emp_token": emp_token,
        "hr_role": hr_role,
        "emp_role": emp_role,
    }


# ── Template endpoints ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_template(stack) -> None:
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.post(
        "/api/v1/kpi/templates/",
        {"name": "Eng KPIs", "description": "Engineering quarterly KPIs"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["name"] == "Eng KPIs"


@pytest.mark.django_db
def test_list_templates(stack) -> None:
    KpiTemplate.all_objects.create(org_id=stack["org"].id, name="T1")
    KpiTemplate.all_objects.create(org_id=stack["org"].id, name="T2")
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.get("/api/v1/kpi/templates/")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ── Cycle endpoints ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_cycle(stack) -> None:
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.post(
        "/api/v1/kpi/cycles/",
        {
            "name": "Q1 2026",
            "type": "quarterly",
            "starts_on": "2026-01-01",
            "ends_on": "2026-03-31",
            "review_opens_on": "2026-04-01",
            "review_closes_on": "2026-04-15",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["status"] == "upcoming"


@pytest.mark.django_db
def test_cycle_state_machine_full_flow(stack) -> None:
    """HR creates cycle → bulk-assign → open self review → submit self →
    open manager review → submit manager → close."""
    c = stack["client"]
    org = stack["org"]
    emp_user = stack["emp_user"]
    hr_token = stack["hr_token"]
    emp_token = stack["emp_token"]

    # Create template
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {hr_token}")
    tmpl = KpiTemplate.all_objects.create(org_id=org.id, name="Full Flow KPIs")
    KpiDefinition.objects.create(template=tmpl, code="V", name="Velocity", metric_type="numeric")

    # Create cycle
    resp = c.post(
        "/api/v1/kpi/cycles/",
        {
            "name": "Full Flow Q1",
            "type": "quarterly",
            "starts_on": "2026-01-01",
            "ends_on": "2026-03-31",
            "review_opens_on": "2026-04-01",
            "review_closes_on": "2026-04-15",
        },
        format="json",
    )
    assert resp.status_code == 201
    cycle_id = resp.json()["id"]

    # Bulk-assign
    resp = c.post(
        "/api/v1/kpi/assignments/",
        {
            "cycle_id": cycle_id,
            "template_id": str(tmpl.id),
            "employee_ids": [str(emp_user.id)],
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["created"] == 1

    # Open self review
    resp = c.post(f"/api/v1/kpi/cycles/{cycle_id}/open-self-review/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "self_review"

    # Employee submits self review
    assignment = KpiAssignment.all_objects.get(cycle_id=cycle_id, employee_id=emp_user.id)
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {emp_token}")
    resp = c.post(
        f"/api/v1/kpi/reviews/{assignment.id}/self/",
        {"scores": {"V": {"score": 80}}, "overall_comment": "Good"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["stage"] == "self"

    # Open manager review
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {hr_token}")
    resp = c.post(f"/api/v1/kpi/cycles/{cycle_id}/open-manager-review/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "manager_review"

    # HR submits manager review
    resp = c.post(
        f"/api/v1/kpi/reviews/{assignment.id}/manager/",
        {"scores": {"V": {"score": 75}}, "overall_comment": "Good team"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["stage"] == "manager"

    # Close cycle
    resp = c.post(f"/api/v1/kpi/cycles/{cycle_id}/close/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


@pytest.mark.django_db
def test_open_self_review_invalid_transition_rejected(stack) -> None:
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    cycle = KpiCycle.all_objects.create(
        org_id=stack["org"].id,
        name="C",
        type="quarterly",
        starts_on="2026-01-01",
        ends_on="2026-03-31",
        review_opens_on="2026-04-01",
        review_closes_on="2026-04-15",
        status="manager_review",
    )
    resp = c.post(f"/api/v1/kpi/cycles/{cycle.id}/open-self-review/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_assignments_me_returns_own(stack) -> None:
    org = stack["org"]
    emp_user = stack["emp_user"]
    c = stack["client"]
    cycle = KpiCycle.all_objects.create(
        org_id=org.id,
        name="C2",
        type="quarterly",
        starts_on="2026-01-01",
        ends_on="2026-03-31",
        review_opens_on="2026-04-01",
        review_closes_on="2026-04-15",
        status="upcoming",
    )
    tmpl = KpiTemplate.all_objects.create(org_id=org.id, name="T")
    KpiAssignment.all_objects.create(
        org_id=org.id,
        cycle=cycle,
        employee_id=emp_user.id,
        template=tmpl,
        kpis=[],
    )
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['emp_token']}")
    resp = c.get("/api/v1/kpi/assignments/me/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["employee_id"] == str(emp_user.id)


@pytest.mark.django_db
def test_team_summary_endpoint(stack) -> None:
    org = stack["org"]
    c = stack["client"]
    cycle = KpiCycle.all_objects.create(
        org_id=org.id,
        name="C3",
        type="quarterly",
        starts_on="2026-01-01",
        ends_on="2026-03-31",
        review_opens_on="2026-04-01",
        review_closes_on="2026-04-15",
        status="upcoming",
    )
    tmpl = KpiTemplate.all_objects.create(org_id=org.id, name="T")
    KpiAssignment.all_objects.create(
        org_id=org.id, cycle=cycle, employee_id=uuid.uuid4(), template=tmpl, kpis=[]
    )
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.get(f"/api/v1/kpi/team-summary?cycle_id={cycle.id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
