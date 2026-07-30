"""Security + validation hardening tests for the feedback module (2026-07-29 review).

Covers:
- Attachment register rejects an s3_key outside the feedback's own prefix
  (bucket-exfiltration oracle) and rejects disallowed content types (stored-XSS).
- Presigned-upload rejects disallowed content types.
- size_bytes ceiling enforced at the serializer.
- s3_key is NOT exposed in attachment output.
- description / note body length caps.
- Audit rows written on note-add and attachment-register.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.feedback.services.attachment import FeedbackAttachmentService
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Harden Org",
        slug="harden-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def emp_client(org):
    u = User.objects.create_user(
        email="emp@harden.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="emp_harden", name="Emp", is_system=True)
    _grant(role, "feedback:submit:self", "feedback:read:self")
    UserRole.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def admin_client(org):
    u = User.objects.create_user(
        email="admin@harden.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="admin_harden", name="Admin", is_system=True)
    _grant(role, "feedback:submit:self", "feedback:read:self", "feedback:manage:org")
    UserRole.objects.create(user=u, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


def _new_feedback(client) -> str:
    return client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]


# --- s3_key namespace binding (bucket exfiltration oracle) ------------------


def test_register_rejects_foreign_s3_key(emp_client):
    fid = _new_feedback(emp_client)
    r = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {
            "filename": "x.png",
            "content_type": "image/png",
            "size_bytes": 100,
            "s3_key": "employees/photos/victim.webp",  # foreign key
        },
        format="json",
    )
    assert r.status_code == 400
    assert "key" in str(r.json()).lower()


def test_register_accepts_own_prefixed_key(emp_client):
    fid = _new_feedback(emp_client)
    r = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {
            "filename": "x.png",
            "content_type": "image/png",
            "size_bytes": 100,
            "s3_key": f"feedback/{fid}/abc_x.png",
        },
        format="json",
    )
    assert r.status_code == 201
    assert "s3_key" not in r.json()  # not exposed in output


# --- content-type allowlist (stored XSS) -----------------------------------


@pytest.mark.parametrize("ct", ["text/html", "image/svg+xml", "application/x-msdownload"])
def test_register_rejects_dangerous_content_type(emp_client, ct):
    fid = _new_feedback(emp_client)
    r = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {"filename": "x", "content_type": ct, "size_bytes": 10, "s3_key": f"feedback/{fid}/x"},
        format="json",
    )
    assert r.status_code == 400


@pytest.mark.parametrize("ct", ["text/html", "image/svg+xml"])
def test_presign_rejects_dangerous_content_type(emp_client, ct):
    fid = _new_feedback(emp_client)
    r = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/presigned-upload/",
        {"filename": "x", "content_type": ct},
        format="json",
    )
    assert r.status_code == 400


# --- size ceiling ----------------------------------------------------------


def test_register_rejects_oversize_declared(emp_client):
    fid = _new_feedback(emp_client)
    r = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {
            "filename": "big.pdf",
            "content_type": "application/pdf",
            "size_bytes": FeedbackAttachmentService.MAX_SIZE_BYTES + 1,
            "s3_key": f"feedback/{fid}/big.pdf",
        },
        format="json",
    )
    assert r.status_code == 400


# --- length caps -----------------------------------------------------------


def test_description_length_capped(emp_client):
    r = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "x" * 10_001},
        format="json",
    )
    assert r.status_code == 400


def test_note_body_length_capped(admin_client):
    fid = _new_feedback(admin_client)
    r = admin_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": "x" * 10_001}, format="json")
    assert r.status_code == 400


# --- audit trail on note + attachment --------------------------------------


def test_note_add_writes_audit(admin_client):
    fid = _new_feedback(admin_client)
    admin_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": "internal"}, format="json")
    assert AuditLog.objects.filter(
        entity="feedback", action="feedback.note.added", entity_id=fid
    ).exists()


def test_attachment_register_writes_audit(emp_client):
    fid = _new_feedback(emp_client)
    emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {
            "filename": "x.png",
            "content_type": "image/png",
            "size_bytes": 100,
            "s3_key": f"feedback/{fid}/x.png",
        },
        format="json",
    )
    assert AuditLog.objects.filter(
        entity="feedback", action="feedback.attachment.registered", entity_id=fid
    ).exists()


# --- status transition guard -----------------------------------------------


def _set_status(admin_client, fid, value):
    return admin_client.patch(f"/api/v1/feedback/{fid}/", {"status": value}, format="json")


def test_transition_blocks_closed_to_new(admin_client):
    fid = _new_feedback(admin_client)
    _set_status(admin_client, fid, "resolved")
    _set_status(admin_client, fid, "closed")
    r = _set_status(admin_client, fid, "new")  # nonsensical reopen
    assert r.status_code == 400
    assert "status" in str(r.json()).lower()


def test_transition_allows_reopen_resolved_to_in_review(admin_client):
    fid = _new_feedback(admin_client)
    _set_status(admin_client, fid, "resolved")
    r = _set_status(admin_client, fid, "in_review")  # legitimate reopen
    assert r.status_code == 200


def test_transition_allows_forward_paths(admin_client):
    fid = _new_feedback(admin_client)
    assert _set_status(admin_client, fid, "in_review").status_code == 200
    assert _set_status(admin_client, fid, "resolved").status_code == 200
    assert _set_status(admin_client, fid, "closed").status_code == 200
