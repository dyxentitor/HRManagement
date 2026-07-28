"""Celery tasks for the employee module."""

from __future__ import annotations

import io
import logging
import uuid
from uuid import UUID

from celery import shared_task
from PIL import Image, ImageOps

from modules.employee.models import Employee
from modules.employee.services.avatar import (
    delete_object,
    s3_bucket,
    s3_client,
)

logger = logging.getLogger(__name__)

THUMB_SIZE = 512
THUMB_QUALITY = 82


@shared_task
def detect_tenure_endings():
    """Daily scan: fire probation/contract-ending alerts for employees at the 30-day mark."""
    from .services.tenure_scan import scan_tenure_endings

    return scan_tenure_endings()


@shared_task(bind=True, max_retries=3)
def process_avatar_upload(self, employee_id: str, original_s3_key: str) -> None:
    """Resize the uploaded original to 512x512 WebP, strip EXIF, swap on Employee, cleanup."""
    employee_uuid = UUID(employee_id)
    s3 = s3_client()
    bucket = s3_bucket()

    try:
        obj = s3.get_object(Bucket=bucket, Key=original_s3_key)
    except Exception as exc:
        logger.exception("process_avatar_upload: failed to fetch original key=%s", original_s3_key)
        raise self.retry(exc=exc, countdown=10) from exc

    body = obj["Body"]
    raw = body.read() if hasattr(body, "read") else body

    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    img = ImageOps.fit(img, (THUMB_SIZE, THUMB_SIZE), Image.LANCZOS, centering=(0.5, 0.5))

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=THUMB_QUALITY, method=6)
    out.seek(0)
    thumb_bytes = out.read()

    new_key = f"avatars/thumbs/{employee_id}/{uuid.uuid4()}.webp"
    s3.put_object(Bucket=bucket, Key=new_key, Body=thumb_bytes, ContentType="image/webp")

    old_key = (
        Employee.all_objects.filter(id=employee_uuid).values_list("photo_s3_key", flat=True).first()
    )
    Employee.all_objects.filter(id=employee_uuid).update(photo_s3_key=new_key)

    delete_object(original_s3_key)
    if old_key and old_key != new_key:
        delete_object(old_key)
