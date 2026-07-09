"""Tests for /api/v1/org/settings GET/PATCH."""

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


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


def _setup_user(org: Organization, perm_codes: list[str]) -> tuple[APIClient, User]:
    user = User.objects.create_user(
        email="u@example.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
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
def test_get_org_settings_authenticated(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "provintell"
    assert body["country_code"] == "MY"


@pytest.mark.django_db
def test_get_org_settings_denied_without_perm(org: Organization) -> None:
    client, _ = _setup_user(org, [])  # no perms
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_patch_org_settings_with_write_perm(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read", "org:settings:write"])
    resp = client.patch(
        "/api/v1/org/settings",
        {"settings": {"theme": "dark"}},
        format="json",
    )
    assert resp.status_code == 200
    org.refresh_from_db()
    assert org.settings == {"theme": "dark"}


@pytest.mark.django_db
def test_patch_org_settings_denied_with_only_read(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])
    resp = client.patch(
        "/api/v1/org/settings",
        {"settings": {"theme": "dark"}},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_get_org_settings_unauthenticated() -> None:
    Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    client = APIClient()
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 401


# ---- v1.9.0 additions: logo_url field + audit log on PATCH ----


@pytest.mark.django_db
def test_get_org_settings_returns_null_logo_url_when_unset(org: Organization) -> None:
    client, _ = _setup_user(org, ["org:settings:read"])
    resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 200
    assert resp.json()["logo_url"] is None


@pytest.mark.django_db
def test_get_org_settings_returns_presigned_url_when_logo_set(org: Organization) -> None:
    from unittest.mock import patch as _patch

    org.logo_s3_key = f"org-logos/{org.id}/abc.webp"
    org.save(update_fields=["logo_s3_key"])
    client, _ = _setup_user(org, ["org:settings:read"])
    with _patch(
        "modules.organization.serializers.presigned_get_url",
        return_value="https://minio.example/x?sig=abc",
    ):
        resp = client.get("/api/v1/org/settings")
    assert resp.status_code == 200
    assert resp.json()["logo_url"] == "https://minio.example/x?sig=abc"


@pytest.mark.django_db
def test_patch_org_settings_writes_audit_log(org: Organization) -> None:
    from common.audit.models import AuditLog

    client, _ = _setup_user(org, ["org:settings:read", "org:settings:write"])
    resp = client.patch(
        "/api/v1/org/settings",
        {"name": "Provintell Rebrand"},
        format="json",
    )
    assert resp.status_code == 200
    log = AuditLog.objects.filter(
        action="org.settings_updated", entity_id=org.id, org_id=org.id
    ).first()
    assert log is not None
    assert "name" in (log.after or {}).get("changed_fields", [])


@pytest.mark.django_db
def test_org_branding_readable_by_any_authenticated_user(org: Organization) -> None:
    # A user with NO org:settings perms still gets branding (for the shell logo),
    # while the full settings endpoint stays gated.
    client, _ = _setup_user(org, [])
    resp = client.get("/api/v1/org/branding")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Provintell"
    assert body["logo_mode"] == "landscape"
    assert set(body.keys()) == {"name", "logo_url", "logo_mode"}
    assert client.get("/api/v1/org/settings").status_code == 403
