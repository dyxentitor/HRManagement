"""Test: GET /api/v1/audit/logs?entity_id=<uuid> returns only rows for that entity_id."""

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
def org():
    return Organization.objects.create(
        name="FilterTestOrg",
        slug=f"fto-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def api_client_admin(org):
    admin = User.objects.create_user(
        email="admin@filtertest.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    admin_role = Role.objects.create(
        org_id=org.id, code="org_admin", name="Admin", is_system=False
    )
    UserRole.objects.create(user=admin, role=admin_role)
    _grant(admin_role, "audit:read:org")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(client, 'admin@filtertest.com')}")
    return client


@pytest.mark.django_db
def test_audit_logs_filter_by_entity_id(api_client_admin, org):
    a, b = uuid.uuid4(), uuid.uuid4()
    AuditLog.objects.create(
        org_id=org.id,
        action="feedback.status.changed",
        entity="feedback",
        entity_id=a,
        after={"status": "resolved"},
    )
    AuditLog.objects.create(
        org_id=org.id,
        action="feedback.status.changed",
        entity="feedback",
        entity_id=b,
        after={"status": "closed"},
    )
    r = api_client_admin.get(f"/api/v1/audit/logs?entity=feedback&entity_id={a}")
    assert r.status_code == 200
    ids = {row["entity_id"] for row in r.json()["results"]}
    assert ids == {str(a)}
