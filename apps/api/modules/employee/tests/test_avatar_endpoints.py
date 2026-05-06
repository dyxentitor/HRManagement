"""Endpoint tests for the v1.7.0 photo upload lane.

Two URL families:
  - /api/v1/employees/me/photo/...     (self, any auth user with linked Employee)
  - /api/v1/employees/{id}/photo/...   (HR, employee:write:org)
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
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


def _employee(
    org: Organization,
    dept: Department,
    *,
    user: User | None = None,
    code: str = "PVT-100",
) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
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


def _self_client(org: Organization, dept: Department) -> tuple[APIClient, Employee]:
    """Auth user with a linked Employee record (mimics a vanilla employee)."""
    user = User.objects.create_user(
        email="self@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    p, _ = Permission.objects.get_or_create(code="employee:read:self", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    emp = _employee(org, dept, user=user, code="PVT-SELF")

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "self@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client, emp


def _hr_client(org: Organization) -> APIClient:
    user = User.objects.create_user(
        email="hr@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR Manager", is_system=True)
    for code in ("employee:read:org", "employee:write:org"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "hr@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client


@pytest.mark.django_db
def test_self_can_request_presigned_upload(org, dept):
    client, _emp = _self_client(org, dept)
    with patch(
        "modules.employee.services.avatar.presigned_put_url",
        return_value="https://signed/",
    ):
        resp = client.post(
            "/api/v1/employees/me/photo/presigned-upload/",
            {"filename": "selfie.jpg", "content_type": "image/jpeg"},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["presigned_url"] == "https://signed/"
    assert body["s3_key"].startswith("avatars/originals/")
    assert body["max_size_bytes"] == 5 * 1024 * 1024


@pytest.mark.django_db
def test_invalid_content_type_rejected(org, dept):
    client, _ = _self_client(org, dept)
    resp = client.post(
        "/api/v1/employees/me/photo/presigned-upload/",
        {"filename": "doc.pdf", "content_type": "application/pdf"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_self_can_register_uploaded_photo(org, dept):
    client, emp = _self_client(org, dept)
    s3_key = f"avatars/originals/{emp.id}/{uuid.uuid4()}.jpg"
    with patch("modules.employee.tasks.process_avatar_upload.delay") as task:
        resp = client.post(
            "/api/v1/employees/me/photo/",
            {"s3_key": s3_key, "content_type": "image/jpeg", "size_bytes": 1024},
            format="json",
        )
    assert resp.status_code == 202, resp.content
    task.assert_called_once_with(str(emp.id), s3_key)


@pytest.mark.django_db
def test_oversize_register_rejected(org, dept):
    client, emp = _self_client(org, dept)
    s3_key = f"avatars/originals/{emp.id}/{uuid.uuid4()}.jpg"
    resp = client.post(
        "/api/v1/employees/me/photo/",
        {
            "s3_key": s3_key,
            "content_type": "image/jpeg",
            "size_bytes": 6 * 1024 * 1024,
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_register_rejects_foreign_s3_key(org, dept):
    """Defense-in-depth: client can't claim someone else's upload key."""
    client, _emp = _self_client(org, dept)
    foreign_id = uuid.uuid4()
    s3_key = f"avatars/originals/{foreign_id}/{uuid.uuid4()}.jpg"
    resp = client.post(
        "/api/v1/employees/me/photo/",
        {"s3_key": s3_key, "content_type": "image/jpeg", "size_bytes": 1024},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_self_can_delete_own_photo(org, dept):
    client, emp = _self_client(org, dept)
    emp.photo_s3_key = "avatars/thumbs/some/key.webp"
    emp.save(update_fields=["photo_s3_key", "updated_at"])

    with patch("modules.employee.services.avatar.delete_object") as del_obj:
        resp = client.delete("/api/v1/employees/me/photo/")
    assert resp.status_code in (200, 204)
    emp.refresh_from_db()
    assert emp.photo_s3_key == ""
    assert del_obj.called


@pytest.mark.django_db
def test_user_without_employee_record_404s(org):
    """Admin/finance demo users without linked Employee get 404."""
    user = User.objects.create_user(
        email="naked@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="org_admin", name="Admin", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "naked@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")

    resp = client.post(
        "/api/v1/employees/me/photo/presigned-upload/",
        {"filename": "x.jpg", "content_type": "image/jpeg"},
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_hr_can_upload_photo_for_other_employee(org, dept):
    hr = _hr_client(org)
    target = _employee(org, dept, code="PVT-TARGET")

    with patch(
        "modules.employee.services.avatar.presigned_put_url",
        return_value="https://signed/",
    ):
        resp = hr.post(
            f"/api/v1/employees/{target.id}/photo/presigned-upload/",
            {"filename": "target.jpg", "content_type": "image/jpeg"},
            format="json",
        )
    assert resp.status_code == 200, resp.content

    user = User.objects.create_user(
        email="rando@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="rando", name="Rando", is_system=False)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    rando = APIClient()
    login = rando.post(
        "/api/v1/auth/login",
        {"email": "rando@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    rando.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    resp = rando.post(
        f"/api/v1/employees/{target.id}/photo/presigned-upload/",
        {"filename": "x.jpg", "content_type": "image/jpeg"},
        format="json",
    )
    assert resp.status_code == 403
