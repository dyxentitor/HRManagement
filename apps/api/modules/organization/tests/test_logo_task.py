"""Tests for the process_org_logo Celery task (v1.9.0)."""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from modules.organization.models import Organization
from modules.organization.tasks import process_org_logo


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="LogoTask",
        slug="logo-task-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _make_image_bytes(size: tuple[int, int], mode: str = "RGB") -> bytes:
    img = Image.new(mode, size, color=(124, 92, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _mock_s3_with_image(raw_bytes: bytes) -> MagicMock:
    client = MagicMock()
    client.get_object.return_value = {"Body": io.BytesIO(raw_bytes)}
    return client


@pytest.mark.django_db
def test_process_org_logo_resizes_to_max_256_webp(org: Organization) -> None:
    raw_key = f"org-logos/raw/{org.id}/test.png"
    org.logo_s3_key = raw_key
    org.save(update_fields=["logo_s3_key"])

    s3 = _mock_s3_with_image(_make_image_bytes((1024, 1024)))

    with (
        patch("modules.organization.tasks.s3_client", return_value=s3),
        patch("modules.organization.tasks.s3_bucket", return_value="hrms"),
        patch("modules.organization.tasks.delete_object") as mock_del,
    ):
        process_org_logo(str(org.id), raw_key)

    s3.get_object.assert_called_once_with(Bucket="hrms", Key=raw_key)
    put_call = s3.put_object.call_args
    assert put_call.kwargs["Bucket"] == "hrms"
    assert put_call.kwargs["Key"].startswith(f"org-logos/{org.id}/")
    assert put_call.kwargs["Key"].endswith(".webp")
    assert put_call.kwargs["ContentType"] == "image/webp"
    out_img = Image.open(io.BytesIO(put_call.kwargs["Body"]))
    assert max(out_img.size) <= 256
    mock_del.assert_called_once_with(raw_key)
    org.refresh_from_db()
    assert org.logo_s3_key == put_call.kwargs["Key"]


@pytest.mark.django_db
def test_process_org_logo_preserves_aspect_ratio(org: Organization) -> None:
    raw_key = f"org-logos/raw/{org.id}/wide.png"
    org.logo_s3_key = raw_key
    org.save(update_fields=["logo_s3_key"])

    s3 = _mock_s3_with_image(_make_image_bytes((1600, 400)))  # 4:1

    with (
        patch("modules.organization.tasks.s3_client", return_value=s3),
        patch("modules.organization.tasks.s3_bucket", return_value="hrms"),
        patch("modules.organization.tasks.delete_object"),
    ):
        process_org_logo(str(org.id), raw_key)

    out_img = Image.open(io.BytesIO(s3.put_object.call_args.kwargs["Body"]))
    # Aspect 4:1 should produce 256 x 64 (not square-cropped)
    assert out_img.size[0] / out_img.size[1] == pytest.approx(4.0, abs=0.05)


@pytest.mark.django_db
def test_process_org_logo_noop_when_org_missing() -> None:
    raw_key = "org-logos/raw/00000000-0000-0000-0000-000000000000/x.png"

    with (
        patch("modules.organization.tasks.s3_client") as mock_client,
        patch("modules.organization.tasks.s3_bucket"),
        patch("modules.organization.tasks.delete_object"),
    ):
        # Should not raise
        process_org_logo("00000000-0000-0000-0000-000000000000", raw_key)
        # No S3 calls when org doesn't exist
        mock_client.assert_not_called()
