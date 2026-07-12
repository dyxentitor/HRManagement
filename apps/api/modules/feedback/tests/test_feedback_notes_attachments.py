"""Tests for FeedbackViewSet notes + attachment actions (Task 6)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from modules.feedback.models import Feedback, FeedbackAttachment, FeedbackNote
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Notes Org",
        slug="notes-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def admin_user(org):
    user = User.objects.create_user(
        email="admin@notestest.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id, code="org_admin_notes", name="Org Admin Notes", is_system=True
    )
    _grant(role, "feedback:submit:self", "feedback:read:self", "feedback:manage:org")
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def emp_user(org):
    user = User.objects.create_user(
        email="emp@notestest.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id, code="employee_notes", name="Employee Notes", is_system=True
    )
    _grant(role, "feedback:submit:self", "feedback:read:self")
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def admin_client(admin_user):
    c = APIClient()
    c.force_authenticate(user=admin_user)
    return c


@pytest.fixture
def emp_client(emp_user):
    c = APIClient()
    c.force_authenticate(user=emp_user)
    return c


# ---------------------------------------------------------------------------
# Notes tests
# ---------------------------------------------------------------------------


def test_notes_manage_only(admin_client, emp_client):
    """Employee POST /notes/ → 403; admin POST → 201; admin GET lists it."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    # Employee cannot post notes
    r_emp = emp_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": "x"}, format="json")
    assert r_emp.status_code == 403

    # Admin can post a note
    r_admin = admin_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": "seen"}, format="json")
    assert r_admin.status_code == 201
    assert r_admin.json()["body"] == "seen"

    # Admin GET lists the note
    r_list = admin_client.get(f"/api/v1/feedback/{fid}/notes/")
    assert r_list.status_code == 200
    notes = r_list.json()
    assert len(notes) == 1
    assert notes[0]["body"] == "seen"


def test_notes_empty_body_rejected(admin_client, emp_client):
    """POST notes with empty body returns 400."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    r = admin_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": ""}, format="json")
    assert r.status_code == 400


def test_notes_creates_db_row(admin_client, emp_client):
    """POST notes actually persists a FeedbackNote row."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    admin_client.post(f"/api/v1/feedback/{fid}/notes/", {"body": "recorded"}, format="json")
    assert FeedbackNote.objects.filter(feedback_id=fid, body="recorded").exists()


def test_employee_cannot_get_notes(emp_client):
    """Employee cannot GET notes either."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    r = emp_client.get(f"/api/v1/feedback/{fid}/notes/")
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Attachment / presigned-upload tests
# ---------------------------------------------------------------------------

_FAKE_URL = "https://s3.example.com/presigned"


def _mock_presign():
    """Context manager that mocks public_s3_client().generate_presigned_url."""
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = _FAKE_URL
    return patch(
        "modules.feedback.services.attachment.public_s3_client",
        return_value=mock_client,
    )


def test_presigned_and_register(emp_client):
    """Reporter can get a presigned URL and register an attachment."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    with _mock_presign():
        pu = emp_client.post(
            f"/api/v1/feedback/{fid}/attachments/presigned-upload/",
            {"filename": "a.png", "content_type": "image/png"},
            format="json",
        )

    assert pu.status_code == 200
    s3_key = pu.json()["s3_key"]
    assert s3_key.startswith(f"feedback/{fid}/")

    reg = emp_client.post(
        f"/api/v1/feedback/{fid}/attachments/",
        {
            "filename": "a.png",
            "content_type": "image/png",
            "size_bytes": 100,
            "s3_key": s3_key,
        },
        format="json",
    )
    assert reg.status_code in (200, 201)
    assert FeedbackAttachment.objects.filter(feedback_id=fid, filename="a.png").exists()


def test_attachments_list(emp_client, admin_user):
    """GET /attachments/ returns list of registered attachments."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    feedback = Feedback.all_objects.get(id=fid)
    FeedbackAttachment.objects.create(
        feedback=feedback,
        filename="doc.pdf",
        content_type="application/pdf",
        size_bytes=200,
        s3_key=f"feedback/{fid}/doc.pdf",
        uploaded_by=admin_user.id,
    )

    r = emp_client.get(f"/api/v1/feedback/{fid}/attachments/")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert any(a["filename"] == "doc.pdf" for a in items)


def test_download_attachment_own(emp_client):
    """Reporter can download their own feedback's attachment."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    feedback = Feedback.all_objects.get(id=fid)
    att = FeedbackAttachment.objects.create(
        feedback=feedback,
        filename="shot.png",
        content_type="image/png",
        size_bytes=512,
        s3_key=f"feedback/{fid}/shot.png",
        uploaded_by=feedback.reporter_id,
    )

    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = _FAKE_URL
    with patch(
        "modules.feedback.services.attachment.public_s3_client",
        return_value=mock_client,
    ):
        r = emp_client.get(f"/api/v1/feedback/{fid}/attachments/{att.id}/download/")

    assert r.status_code == 200
    assert "url" in r.json()


def test_download_attachment_other_emp_forbidden(emp_client, admin_client):
    """Employee cannot download attachments on feedback they don't own."""
    fid = admin_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]

    feedback = Feedback.all_objects.get(id=fid)
    att = FeedbackAttachment.objects.create(
        feedback=feedback,
        filename="secret.png",
        content_type="image/png",
        size_bytes=512,
        s3_key=f"feedback/{fid}/secret.png",
        uploaded_by=feedback.reporter_id,
    )

    r = emp_client.get(f"/api/v1/feedback/{fid}/attachments/{att.id}/download/")
    assert r.status_code == 403
