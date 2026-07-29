"""FeedbackAttachment service — presigned S3 PUT URL flow.

Client flow:
    1. POST /api/v1/feedback/{id}/attachments/presigned-upload
       Returns {presigned_url, s3_key, max_size_bytes}
    2. Client PUTs the file directly to S3 via the presigned_url.
    3. POST /api/v1/feedback/{id}/attachments {filename, content_type, size_bytes, s3_key}
       Creates the metadata row.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, ClassVar

from rest_framework.exceptions import ValidationError

from common.storage.s3 import bucket as _bucket
from common.storage.s3 import internal_s3_client, public_s3_client

from ..models import Feedback, FeedbackAttachment

logger = logging.getLogger(__name__)


class FeedbackAttachmentService:
    MAX_SIZE_BYTES: ClassVar[int] = 25 * 1024 * 1024  # 25 MB

    # Allowlist of storable content types. Deliberately excludes image/svg+xml
    # and text/html — those execute as scripts when opened from the storage
    # origin (stored-XSS vector). Covers the product's advertised set:
    # images, PDF, video, plus plain text.
    ALLOWED_CONTENT_TYPES: ClassVar[frozenset[str]] = frozenset(
        {
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
            "application/pdf",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "text/plain",
        }
    )

    @classmethod
    def _validate_content_type(cls, content_type: str) -> None:
        if content_type not in cls.ALLOWED_CONTENT_TYPES:
            raise ValidationError({"content_type": f"Unsupported file type '{content_type}'."})

    @staticmethod
    def presigned_upload(feedback: Feedback, filename: str, content_type: str) -> dict[str, Any]:
        FeedbackAttachmentService._validate_content_type(content_type)
        s3_key = f"feedback/{feedback.id}/{uuid.uuid4()}_{filename}"
        url = public_s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _bucket(),
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,  # 5 min
        )
        return {
            "presigned_url": url,
            "s3_key": s3_key,
            "max_size_bytes": FeedbackAttachmentService.MAX_SIZE_BYTES,
        }

    @staticmethod
    def register(
        feedback: Feedback,
        filename: str,
        content_type: str,
        size_bytes: int,
        s3_key: str,
        uploaded_by: uuid.UUID,
    ) -> FeedbackAttachment:
        if size_bytes > FeedbackAttachmentService.MAX_SIZE_BYTES:
            raise ValidationError({"size_bytes": "File exceeds 25 MB."})
        FeedbackAttachmentService._validate_content_type(content_type)
        # Bind the attachment to THIS feedback's key namespace. Without this a
        # client could register an arbitrary key (e.g. employees/…/photo.webp)
        # and then obtain a presigned GET for any object in the shared bucket.
        if not s3_key.startswith(f"feedback/{feedback.id}/"):
            raise ValidationError({"s3_key": "Invalid attachment key for this feedback."})
        return FeedbackAttachment.objects.create(
            feedback=feedback,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            s3_key=s3_key,
            uploaded_by=uploaded_by,
        )

    @staticmethod
    def download_url(attachment: FeedbackAttachment) -> dict[str, Any]:
        url = public_s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": attachment.s3_key},
            ExpiresIn=300,
        )
        return {"url": url, "filename": attachment.filename}

    @staticmethod
    def delete(attachment: FeedbackAttachment) -> None:
        try:
            internal_s3_client().delete_object(Bucket=_bucket(), Key=attachment.s3_key)
        except Exception as exc:  # pragma: no cover
            logger.warning("S3 delete failed for %s: %s", attachment.s3_key, exc)
        attachment.delete()
