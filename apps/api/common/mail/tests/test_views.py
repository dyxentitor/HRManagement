from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from common.mail.models import EmailConfiguration
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _client(org, perms):
    user = User.objects.create_user(
        email="a@e.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org.id, code="org_admin", name="A", is_system=True)
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    c = APIClient()
    tok = c.post(
        "/api/v1/auth/login",
        {"email": "a@e.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
    return c


@pytest.mark.django_db
def test_get_denied_without_perm(org):
    resp = _client(org, []).get("/api/v1/org/email-config/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_get_returns_config_without_password(org):
    EmailConfiguration.objects.create(
        org_id=org.id,
        smtp_host="h",
        smtp_password="pw",  # pragma: allowlist secret
    )
    resp = _client(org, ["org:email_config:read"]).get("/api/v1/org/email-config/")
    assert resp.status_code == 200
    assert "smtp_password" not in resp.json()
    assert resp.json()["has_password"] is True


@pytest.mark.django_db
def test_patch_audits_field_names_only(org):
    c = _client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.patch("/api/v1/org/email-config/", {"sender_name": "HR Bot"}, format="json")
    assert resp.status_code == 200
    row = AuditLog.objects.filter(action="email_config.updated").first()
    assert row is not None
    assert "sender_name" in row.after["changed_fields"]


@pytest.mark.django_db
def test_test_connection_endpoint(org):
    c = _client(org, ["org:email_config:read", "org:email_config:write"])
    with patch("common.mail.service.build_connection") as bc:
        bc.return_value.open.return_value = True
        bc.return_value.close.return_value = None
        resp = c.post(
            "/api/v1/org/email-config/test-connection/",
            {"smtp_host": "h"},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
