"""ClaimAttachment service — presigned S3 PUT URL flow.

Client flow:
    1. POST /api/v1/claims/{id}/attachments/presigned-upload
       Returns {presigned_url, s3_key, max_size_bytes}
    2. Client PUTs the file directly to S3 via the presigned_url.
    3. POST /api/v1/claims/{id}/attachments {filename, content_type, size_bytes, s3_key}
       Creates the metadata row.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import boto3
from botocore.config import Config

from ..models import ClaimAttachment, ClaimRequest

logger = logging.getLogger(__name__)


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),  # pragma: allowlist secret
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def _bucket() -> str:
    return os.environ.get("S3_BUCKET", "hrms")


class AttachmentService:
    MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

    @staticmethod
    def presigned_upload(
        *, claim: ClaimRequest, filename: str, content_type: str
    ) -> dict[str, Any]:
        s3_key = f"claims/{claim.id}/{uuid.uuid4()}_{filename}"
        url = _s3_client().generate_presigned_url(
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
            "max_size_bytes": AttachmentService.MAX_SIZE_BYTES,
        }

    @staticmethod
    def register(
        *,
        claim: ClaimRequest,
        filename: str,
        content_type: str,
        size_bytes: int,
        s3_key: str,
        uploaded_by: uuid.UUID,
    ) -> ClaimAttachment:
        if size_bytes > AttachmentService.MAX_SIZE_BYTES:
            raise ValueError(f"size {size_bytes} exceeds {AttachmentService.MAX_SIZE_BYTES}")
        return ClaimAttachment.objects.create(
            claim=claim,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            s3_key=s3_key,
            uploaded_by=uploaded_by,
        )

    @staticmethod
    def presigned_get(*, attachment: ClaimAttachment) -> str:
        return _s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": attachment.s3_key},
            ExpiresIn=300,
        )

    @staticmethod
    def delete(*, attachment: ClaimAttachment) -> None:
        try:
            _s3_client().delete_object(Bucket=_bucket(), Key=attachment.s3_key)
        except Exception as exc:  # pragma: no cover
            logger.warning("S3 delete failed for %s: %s", attachment.s3_key, exc)
        attachment.delete()
