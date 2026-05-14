"""Tests for /api/v1/org/logo presigned-upload + register + delete endpoints (v1.9.0)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell-logo",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _setup_user(org: Organization, perm_codes: list[str]) -> tuple[APIClient, User]:
    user = User.objects.create_user(
        email="u@example.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="org_admin", name="Org Admin", is_system=True)
    for code in perm_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "u@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client, user


@pytest.mark.django_db
@patch(
    "modules.organization.views.presigned_put_url", return_value="https://minio.example/x?sig=abc"
)
def test_presign_logo_upload_returns_url_and_key(mock_presign, org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:write"])
    resp = client.post(
        "/api/v1/org/logo/presigned-upload",
        {"content_type": "image/png"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["presigned_url"].startswith("https://")
    assert body["s3_key"].startswith(f"org-logos/raw/{org.id}/")
    assert body["s3_key"].endswith(".png")


@pytest.mark.django_db
def test_presign_logo_rejects_bad_content_type(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:write"])
    resp = client.post(
        "/api/v1/org/logo/presigned-upload",
        {"content_type": "image/gif"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_presign_logo_requires_settings_write_perm(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])  # read only
    resp = client.post(
        "/api/v1/org/logo/presigned-upload",
        {"content_type": "image/png"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
@patch("modules.organization.views.process_org_logo")
def test_register_logo_writes_key_and_enqueues_task(mock_task, org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read", "org:settings:write"])
    s3_key = f"org-logos/raw/{org.id}/abc.png"
    resp = client.post(
        "/api/v1/org/logo",
        {"s3_key": s3_key, "content_type": "image/png", "size_bytes": 100000},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    org.refresh_from_db()
    assert org.logo_s3_key == s3_key
    mock_task.delay.assert_called_once_with(str(org.id), s3_key)


@pytest.mark.django_db
def test_register_logo_rejects_oversize(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:write"])
    resp = client.post(
        "/api/v1/org/logo",
        {
            "s3_key": f"org-logos/raw/{org.id}/abc.png",
            "content_type": "image/png",
            "size_bytes": 3 * 1024 * 1024,
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_register_logo_rejects_prefix_mismatch(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:write"])
    other = Organization.objects.create(
        name="Other",
        slug="other-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    resp = client.post(
        "/api/v1/org/logo",
        {
            "s3_key": f"org-logos/raw/{other.id}/abc.png",
            "content_type": "image/png",
            "size_bytes": 100,
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
@patch("modules.organization.views.process_org_logo")
def test_register_logo_writes_audit_log(_mock_task, org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:write"])
    s3_key = f"org-logos/raw/{org.id}/abc.png"
    client.post(
        "/api/v1/org/logo",
        {"s3_key": s3_key, "content_type": "image/png", "size_bytes": 100},
        format="json",
    )
    assert AuditLog.objects.filter(
        action="org.logo_updated", entity_id=org.id, org_id=org.id
    ).exists()


@pytest.mark.django_db
def test_delete_logo_clears_key(org: Organization) -> None:
    org.logo_s3_key = "org-logos/xyz/abc.webp"
    org.save()
    client, _ = _setup_user(org, ["org:settings:write"])
    resp = client.delete("/api/v1/org/logo")
    assert resp.status_code == 204
    org.refresh_from_db()
    assert not org.logo_s3_key


@pytest.mark.django_db
def test_delete_logo_writes_audit_log(org: Organization) -> None:
    org.logo_s3_key = "org-logos/xyz/abc.webp"
    org.save()
    client, _ = _setup_user(org, ["org:settings:write"])
    client.delete("/api/v1/org/logo")
    assert AuditLog.objects.filter(
        action="org.logo_removed", entity_id=org.id, org_id=org.id
    ).exists()
