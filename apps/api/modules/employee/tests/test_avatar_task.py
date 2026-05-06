"""Tests for the process_avatar_upload Celery task.

We run the task synchronously (calling the underlying function, not .delay()).
S3 calls are mocked by patching s3_client() to return a fake boto3 client.
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet
from PIL import Image

from modules.employee.models import Employee
from modules.organization.models import Department, Organization

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def employee(db) -> Employee:
    org = Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Operations")
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-T",
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


def _make_mock_s3(original_bytes: bytes) -> MagicMock:
    """Mock that simulates MinIO. get_object returns the bytes; put_object
    captures whatever was uploaded into _uploaded so tests can inspect."""
    uploaded: dict[str, bytes] = {}
    mock = MagicMock()

    def get_object(*, Bucket: str, Key: str):
        return {"Body": io.BytesIO(original_bytes)}

    def put_object(*, Bucket: str, Key: str, Body, ContentType: str = ""):
        uploaded[Key] = Body if isinstance(Body, bytes) else Body
        return {}

    mock.get_object.side_effect = get_object
    mock.put_object.side_effect = put_object
    mock.delete_object.return_value = {}
    mock._uploaded = uploaded
    return mock


@pytest.mark.django_db
def test_resize_produces_512_square_webp(employee: Employee):
    fixture = FIXTURES / "test_avatar_2000x3000.jpg"
    raw = fixture.read_bytes()
    mock_s3 = _make_mock_s3(raw)

    original_key = f"avatars/originals/{employee.id}/x.jpg"
    with (
        patch("modules.employee.services.avatar.s3_client", return_value=mock_s3),
        patch("modules.employee.tasks.s3_client", return_value=mock_s3),
    ):
        from modules.employee.tasks import process_avatar_upload

        process_avatar_upload(str(employee.id), original_key)

    employee.refresh_from_db()
    assert employee.photo_s3_key.startswith(f"avatars/thumbs/{employee.id}/")
    assert employee.photo_s3_key.endswith(".webp")

    uploaded_bytes = mock_s3._uploaded[employee.photo_s3_key]
    img = Image.open(io.BytesIO(uploaded_bytes))
    assert img.format == "WEBP"
    assert img.size == (512, 512)


@pytest.mark.django_db
def test_exif_stripped(employee: Employee):
    fixture = FIXTURES / "test_avatar_with_gps_exif.jpg"
    raw = fixture.read_bytes()
    mock_s3 = _make_mock_s3(raw)

    # Sanity-check the source has EXIF
    assert len(Image.open(io.BytesIO(raw)).getexif()) > 0

    with (
        patch("modules.employee.services.avatar.s3_client", return_value=mock_s3),
        patch("modules.employee.tasks.s3_client", return_value=mock_s3),
    ):
        from modules.employee.tasks import process_avatar_upload

        process_avatar_upload(str(employee.id), f"avatars/originals/{employee.id}/x.jpg")

    employee.refresh_from_db()
    uploaded_bytes = mock_s3._uploaded[employee.photo_s3_key]
    img = Image.open(io.BytesIO(uploaded_bytes))
    exif = img.getexif()
    # No EXIF after re-encode through ImageOps.exif_transpose + convert("RGB")
    assert len(exif) == 0


@pytest.mark.django_db
def test_employee_record_updated_and_original_deleted(employee: Employee):
    fixture = FIXTURES / "test_avatar_2000x3000.jpg"
    raw = fixture.read_bytes()
    mock_s3 = _make_mock_s3(raw)
    original_key = f"avatars/originals/{employee.id}/x.jpg"

    with (
        patch("modules.employee.services.avatar.s3_client", return_value=mock_s3),
        patch("modules.employee.tasks.s3_client", return_value=mock_s3),
    ):
        from modules.employee.tasks import process_avatar_upload

        process_avatar_upload(str(employee.id), original_key)

    employee.refresh_from_db()
    assert employee.photo_s3_key != ""
    deleted_keys = [c.kwargs.get("Key") for c in mock_s3.delete_object.call_args_list]
    assert original_key in deleted_keys
