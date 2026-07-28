"""Tests for email-template API endpoints (Task 11).

TDD: write tests first, then implement.

Coverage:
- GET  /api/v1/org/email-templates/          list
- GET  /api/v1/org/email-templates/{key}/    detail
- PATCH /api/v1/org/email-templates/{key}/   upsert override
- DELETE /api/v1/org/email-templates/{key}/  reset (204)
- POST /api/v1/org/email-templates/{key}/preview/  preview rendered
- 403 for user without org:email_config perms
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from common.mail.emails import SUBJECTS
from common.mail.models import EmailTemplate
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="TestOrg",
        slug="testorg",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _make_client(org, perms: list[str]) -> APIClient:
    """Create an API client authenticated as a user with the given perms."""
    import uuid

    email = f"u{uuid.uuid4().hex[:6]}@test.com"
    user = User.objects.create_user(
        email=email,
        password="testpass",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id, code=f"role_{uuid.uuid4().hex[:4]}", name="R", is_system=True
    )
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    c = APIClient()
    tok = c.post(
        "/api/v1/auth/login",
        {"email": email, "password": "testpass"},  # pragma: allowlist secret
        format="json",
    ).json()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
    return c


# ---------------------------------------------------------------------------
# List endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_returns_known_keys(org):
    """GET /email-templates/ returns one entry per SUBJECTS key."""
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 200
    data = resp.json()
    returned_keys = {item["key"] for item in data}
    assert returned_keys == set(SUBJECTS.keys())


@pytest.mark.django_db
def test_list_has_override_false_when_no_override(org):
    """No DB overrides → all list entries have has_override=False."""
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 200
    for item in resp.json():
        assert item["has_override"] is False, f"key={item['key']} should have has_override=False"


@pytest.mark.django_db
def test_list_includes_placeholders(org):
    """List entries include a placeholders list."""
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 200
    for item in resp.json():
        assert "placeholders" in item
        assert isinstance(item["placeholders"], list)


@pytest.mark.django_db
def test_list_shows_has_override_true_after_patch(org):
    """After a PATCH, the list shows has_override=True for that key."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {
            "subject": "Custom invite",
            "text_body": "Hello {{ org }}",
            "html_body": "<p>Hello {{ org }}</p>",
        },
        format="json",
    )
    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 200
    invite = next(item for item in resp.json() if item["key"] == "invite")
    assert invite["has_override"] is True


# ---------------------------------------------------------------------------
# List 403 without perms
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_requires_read_perm(org):
    """User without org:email_config:read gets 403."""
    c = _make_client(org, [])
    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Detail endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_detail_unknown_key_returns_404(org):
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/nonexistent_key/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_detail_no_override_returns_empty_bodies(org):
    """When no override exists, detail returns has_override=False and empty bodies."""
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["key"] == "invite"
    assert body["has_override"] is False
    assert body["subject"] == ""
    assert body["text_body"] == ""
    assert body["html_body"] == ""


@pytest.mark.django_db
def test_detail_with_override_returns_stored_values(org):
    """After a PATCH, detail returns the stored override content."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {
            "subject": "Custom invite for {{ org }}",
            "text_body": "Click {{ link }}",
            "html_body": "<a href='{{ link }}'>Activate</a>",
        },
        format="json",
    )
    resp = c.get("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_override"] is True
    assert body["subject"] == "Custom invite for {{ org }}"
    assert body["text_body"] == "Click {{ link }}"
    assert "Activate" in body["html_body"]


@pytest.mark.django_db
def test_detail_includes_placeholders(org):
    c = _make_client(org, ["org:email_config:read"])
    resp = c.get("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 200
    body = resp.json()
    assert "placeholders" in body
    assert isinstance(body["placeholders"], list)
    names = [p["name"] for p in body["placeholders"]]
    assert "org" in names
    assert "link" in names


@pytest.mark.django_db
def test_detail_requires_read_perm(org):
    c = _make_client(org, [])
    resp = c.get("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH endpoint (upsert)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_patch_creates_override(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Welcome to HRMS", "text_body": "Hi there", "html_body": "<p>Hi</p>"},
        format="json",
    )
    assert resp.status_code == 200
    assert EmailTemplate.objects.filter(org_id=org.id, key="invite").exists()


@pytest.mark.django_db
def test_patch_returns_saved_data(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.patch(
        "/api/v1/org/email-templates/password_reset/",
        {
            "subject": "Reset it",
            "text_body": "{{ reset_url }}",
            "html_body": "<p>{{ reset_url }}</p>",
        },
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject"] == "Reset it"
    assert body["has_override"] is True


@pytest.mark.django_db
def test_patch_updates_existing_override(org):
    """A second PATCH updates (not duplicates) the override row."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "First", "text_body": "v1", "html_body": ""},
        format="json",
    )
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Second", "text_body": "v2", "html_body": ""},
        format="json",
    )
    assert EmailTemplate.objects.filter(org_id=org.id, key="invite").count() == 1
    row = EmailTemplate.objects.get(org_id=org.id, key="invite")
    assert row.subject == "Second"


@pytest.mark.django_db
def test_patch_writes_audit_log(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Audited", "text_body": "body", "html_body": ""},
        format="json",
    )
    assert AuditLog.objects.filter(action="email_template.updated").exists()


@pytest.mark.django_db
def test_patch_requires_write_perm(org):
    c = _make_client(org, ["org:email_config:read"])  # read only — no write
    resp = c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "X"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_patch_unknown_key_returns_404(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.patch("/api/v1/org/email-templates/bad_key/", {"subject": "X"}, format="json")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE endpoint (reset)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_delete_removes_override(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Custom", "text_body": "body", "html_body": ""},
        format="json",
    )
    assert EmailTemplate.objects.filter(org_id=org.id, key="invite").exists()

    resp = c.delete("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 204
    assert not EmailTemplate.objects.filter(org_id=org.id, key="invite").exists()


@pytest.mark.django_db
def test_delete_resets_has_override_in_list(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Custom", "text_body": "body", "html_body": ""},
        format="json",
    )
    c.delete("/api/v1/org/email-templates/invite/")

    resp = c.get("/api/v1/org/email-templates/")
    assert resp.status_code == 200
    invite = next(item for item in resp.json() if item["key"] == "invite")
    assert invite["has_override"] is False


@pytest.mark.django_db
def test_delete_no_override_returns_204(org):
    """DELETE when no override row exists is idempotent — still 204."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.delete("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 204


@pytest.mark.django_db
def test_delete_writes_audit_log(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {"subject": "Custom", "text_body": "body", "html_body": ""},
        format="json",
    )
    AuditLog.objects.filter(action="email_template.reset").delete()  # clear
    c.delete("/api/v1/org/email-templates/invite/")
    assert AuditLog.objects.filter(action="email_template.reset").exists()


@pytest.mark.django_db
def test_delete_requires_write_perm(org):
    c = _make_client(org, ["org:email_config:read"])  # no write
    resp = c.delete("/api/v1/org/email-templates/invite/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_delete_unknown_key_returns_404(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.delete("/api/v1/org/email-templates/bad_key/")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Preview endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_preview_with_posted_body_uses_posted_content(org):
    """POST to preview with body fields renders THOSE strings with sample data."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.post(
        "/api/v1/org/email-templates/invite/preview/",
        {
            "subject": "Welcome to {{ org }}",
            "text_body": "Click here: {{ link }} - expires in {{ hours }}h",
            "html_body": "<p>Click <a href='{{ link }}'>here</a></p>",
        },
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "subject" in body
    assert "text" in body
    assert "html" in body
    # Sample data injected: org=Provintell, link=https://hrms/activate/xyz, hours=48
    assert "Provintell" in body["subject"]
    assert "https://hrms/activate/xyz" in body["text"]
    assert "48" in body["text"]


@pytest.mark.django_db
def test_preview_without_body_renders_override(org):
    """POST to preview with no body renders the stored override with sample data."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    c.patch(
        "/api/v1/org/email-templates/invite/",
        {
            "subject": "Stored: {{ org }}",
            "text_body": "Stored link: {{ link }}",
            "html_body": "<p>Stored</p>",
        },
        format="json",
    )
    resp = c.post("/api/v1/org/email-templates/invite/preview/", {}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert "Provintell" in body["subject"]
    assert "https://hrms/activate/xyz" in body["text"]


@pytest.mark.django_db
def test_preview_sample_data_from_placeholders(org):
    """Preview for bank_changed key includes bank-related sample data."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.post(
        "/api/v1/org/email-templates/bank_changed/preview/",
        {
            "subject": "Bank info changed for {{ name }}",
            "text_body": "{{ name }} changed bank to {{ bank_name }}",
            "html_body": "",
        },
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "Jane Doe" in body["subject"]
    assert "Maybank" in body["text"]


@pytest.mark.django_db
def test_preview_unknown_key_returns_404(org):
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.post("/api/v1/org/email-templates/nonexistent/preview/", {}, format="json")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_preview_requires_read_perm(org):
    c = _make_client(org, [])
    resp = c.post(
        "/api/v1/org/email-templates/invite/preview/",
        {"subject": "X", "text_body": "X", "html_body": "X"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_preview_keys_without_placeholders(org):
    """Keys with no registered placeholders (e.g. security, digest subset) still preview."""
    c = _make_client(org, ["org:email_config:read", "org:email_config:write"])
    resp = c.post(
        "/api/v1/org/email-templates/security/preview/",
        {"subject": "Alert!", "text_body": "Security event occurred.", "html_body": ""},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["subject"] == "Alert!"
    assert body["text"] == "Security event occurred."
