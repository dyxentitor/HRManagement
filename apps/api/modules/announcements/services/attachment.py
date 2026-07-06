"""AnnouncementAttachment service — presigned S3 PUT flow (claims-attachment pattern)."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from common.storage.s3 import bucket as _bucket
from common.storage.s3 import internal_s3_client, public_s3_client

from ..models import Announcement, AnnouncementAttachment

logger = logging.getLogger(__name__)


class AttachmentService:
    MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

    @staticmethod
    def presigned_upload(
        *, announcement: Announcement, filename: str, content_type: str
    ) -> dict[str, Any]:
        s3_key = f"announcements/{announcement.id}/{uuid.uuid4().hex}_{filename}"
        url = public_s3_client().generate_presigned_url(
            "put_object",
            Params={"Bucket": _bucket(), "Key": s3_key, "ContentType": content_type},
            ExpiresIn=300,
        )
        return {
            "presigned_url": url,
            "s3_key": s3_key,
            "max_size_bytes": AttachmentService.MAX_SIZE_BYTES,
        }

    @staticmethod
    def register(
        *,
        announcement: Announcement,
        filename: str,
        content_type: str,
        size_bytes: int,
        s3_key: str,
        uploaded_by: uuid.UUID,
    ) -> AnnouncementAttachment:
        if size_bytes > AttachmentService.MAX_SIZE_BYTES:
            raise ValueError(f"size {size_bytes} exceeds {AttachmentService.MAX_SIZE_BYTES}")
        return AnnouncementAttachment.objects.create(
            announcement=announcement,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            s3_key=s3_key,
            uploaded_by=uploaded_by,
        )

    @staticmethod
    def presigned_get(*, attachment: AnnouncementAttachment) -> str:
        return public_s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": attachment.s3_key},
            ExpiresIn=300,
        )

    @staticmethod
    def delete(*, attachment: AnnouncementAttachment) -> None:
        try:
            internal_s3_client().delete_object(Bucket=_bucket(), Key=attachment.s3_key)
        except Exception as exc:  # pragma: no cover
            logger.warning("S3 delete failed for %s: %s", attachment.s3_key, exc)
        attachment.delete()
