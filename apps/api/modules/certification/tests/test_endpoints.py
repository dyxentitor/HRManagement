"""Integration tests for /api/v1/certifications and /api/v1/training/* endpoints."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from modules.certification.models import Certification, TrainingAssignment, TrainingPlan
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
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
        name="Cert Corp",
        slug="cert-corp",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    hr_role = Role.objects.create(org_id=org.id, code="hr", name="HR", is_system=True)
    _grant(
        hr_role,
        "cert:read:self",
        "cert:read:team",
        "cert:read:org",
        "cert:write:self",
        "cert:write:org",
        "training:plan:read",
        "training:plan:write",
        "training:assignment:read:self",
        "training:assignment:write:team",
        "training:progress:write:self",
    )
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Emp", is_system=True)
    _grant(
        emp_role,
        "cert:read:self",
        "cert:write:self",
        "training:assignment:read:self",
        "training:progress:write:self",
    )

    hr_user = User.objects.create_user(
        email="hr@cert.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    UserRole.objects.create(user=hr_user, role=hr_role)

    emp_user = User.objects.create_user(
        email="emp@cert.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    UserRole.objects.create(user=emp_user, role=emp_role)

    client = APIClient()
    hr_token = _login(client, "hr@cert.test")
    emp_token = _login(client, "emp@cert.test")

    return {
        "org": org,
        "hr_user": hr_user,
        "emp_user": emp_user,
        "client": client,
        "hr_token": hr_token,
        "emp_token": emp_token,
    }


# ── Certification endpoints ──────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_certification(stack) -> None:
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.post(
        "/api/v1/certifications/",
        {
            "employee_id": str(stack["emp_user"].id),
            "name": "AWS Solutions Architect",
            "issuer": "Amazon",
            "issued_on": "2025-01-01",
            "expires_on": "2028-01-01",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["name"] == "AWS Solutions Architect"
    assert data["status"] == "active"


@pytest.mark.django_db
def test_list_certifications(stack) -> None:
    org_id = stack["org"].id
    Certification.all_objects.create(
        org_id=org_id,
        employee_id=stack["emp_user"].id,
        name="Cert A",
        issued_on="2025-01-01",
        expires_on="2028-01-01",
    )
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.get("/api/v1/certifications/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.django_db
def test_my_certifications(stack) -> None:
    org_id = stack["org"].id
    Certification.all_objects.create(
        org_id=org_id,
        employee_id=stack["emp_user"].id,
        name="My Cert",
        issued_on="2025-01-01",
        expires_on="2028-01-01",
    )
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['emp_token']}")
    resp = c.get("/api/v1/certifications/me/")
    assert resp.status_code == 200
    names = [item["name"] for item in resp.json()]
    assert "My Cert" in names


# ── Training plan endpoints ──────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_training_plan(stack) -> None:
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.post(
        "/api/v1/training/plans/",
        {"name": "Safety Training", "description": "Annual safety compliance"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["name"] == "Safety Training"


@pytest.mark.django_db
def test_list_training_plans(stack) -> None:
    TrainingPlan.all_objects.create(org_id=stack["org"].id, name="Plan A", description="")
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")
    resp = c.get("/api/v1/training/plans/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ── Training assignment endpoints ────────────────────────────────────────────


@pytest.mark.django_db
def test_create_and_complete_assignment(stack) -> None:
    plan = TrainingPlan.all_objects.create(org_id=stack["org"].id, name="Plan", description="")
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['hr_token']}")

    # Create assignment
    resp = c.post(
        "/api/v1/training/assignments/",
        {
            "plan": str(plan.id),
            "employee_id": str(stack["emp_user"].id),
            "due_date": "2026-12-31",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assignment_id = resp.json()["id"]

    # Complete assignment
    resp2 = c.post(
        f"/api/v1/training/assignments/{assignment_id}/complete/",
        {"s3_key": ""},
        format="json",
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "completed"


@pytest.mark.django_db
def test_my_assignments(stack) -> None:
    plan = TrainingPlan.all_objects.create(org_id=stack["org"].id, name="Plan", description="")
    TrainingAssignment.all_objects.create(
        org_id=stack["org"].id,
        plan=plan,
        employee_id=stack["emp_user"].id,
        assigned_by=stack["hr_user"].id,
        due_date="2026-12-31",
    )
    c = stack["client"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {stack['emp_token']}")
    resp = c.get("/api/v1/training/assignments/me/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
