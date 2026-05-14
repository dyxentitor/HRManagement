"""Celery tasks for the organization module."""

from __future__ import annotations

import io
import logging
import uuid
from uuid import UUID

from celery import shared_task
from PIL import Image, ImageOps

from modules.employee.services.avatar import delete_object, s3_bucket, s3_client
from modules.organization.models import Organization

logger = logging.getLogger(__name__)

LOGO_MAX_DIM = 256
LOGO_WEBP_QUALITY = 85

# v1.9.2 (L1): magic-byte sniffer. The presigned PUT already binds the
# content-type at signing time and Pillow rejects non-image bytes, but
# checking the leading bytes lets us fail fast with a clear log message
# instead of a deep traceback from PIL.
_IMAGE_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


def _detect_image_type(raw: bytes) -> str | None:
    for sig, mime in _IMAGE_MAGIC:
        if raw.startswith(sig):
            return mime
    # WebP is RIFF<size>WEBP — check the 4-byte container marker at offset 8.
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_org_logo(self, org_id: str, raw_s3_key: str) -> str:
    """Download raw logo, strip EXIF, resize to max 256x256 preserving aspect,
    encode WebP q85, upload canonical key, swap on Organization, cleanup raw.

    Idempotent: no-op if org doesn't exist (e.g. deleted between confirm and run).
    """
    try:
        org_uuid = UUID(org_id)
    except (TypeError, ValueError):
        logger.warning("process_org_logo: invalid org_id=%s", org_id)
        return ""

    if not Organization.objects.filter(id=org_uuid).exists():
        logger.info("process_org_logo: org=%s no longer exists, skipping", org_id)
        return ""

    s3 = s3_client()
    bucket = s3_bucket()

    try:
        obj = s3.get_object(Bucket=bucket, Key=raw_s3_key)
    except Exception as exc:
        logger.exception("process_org_logo: failed to fetch raw key=%s", raw_s3_key)
        raise self.retry(exc=exc, countdown=10) from exc

    body = obj["Body"]
    raw = body.read() if hasattr(body, "read") else body

    detected = _detect_image_type(raw)
    if detected is None:
        # Not an image. Clean up the raw upload so we don't leave junk in S3.
        logger.warning(
            "process_org_logo: rejecting non-image content for key=%s "
            "(size=%d bytes, first 4 bytes=%r)",
            raw_s3_key,
            len(raw),
            raw[:4] if raw else b"",
        )
        delete_object(raw_s3_key)
        return ""

    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    # Logos may have transparency; preserve alpha by going through RGBA.
    img = img.convert("RGBA")
    # Preserve aspect ratio — don't crop wordmark logos.
    img.thumbnail((LOGO_MAX_DIM, LOGO_MAX_DIM), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=LOGO_WEBP_QUALITY, method=6)
    out.seek(0)
    thumb_bytes = out.read()

    new_key = f"org-logos/{org_id}/{uuid.uuid4()}.webp"
    s3.put_object(Bucket=bucket, Key=new_key, Body=thumb_bytes, ContentType="image/webp")

    # v1.9.1 (L3): use save() so any future pre_save / post_save signals on
    # Organization (e.g. cache-invalidation) fire. .update() would silently
    # skip them.
    org = Organization.objects.get(id=org_uuid)
    old_key = org.logo_s3_key
    org.logo_s3_key = new_key
    org.save(update_fields=["logo_s3_key", "updated_at"])

    delete_object(raw_s3_key)
    if old_key and old_key != new_key and old_key != raw_s3_key:
        delete_object(old_key)

    return new_key
