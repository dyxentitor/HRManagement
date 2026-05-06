"""Avatar S3 helpers — presigned PUT/GET + delete (mirror of claims/services/attachment.py).

Used by EmployeeViewSet's photo actions and the process_avatar_upload task.
"""

from __future__ import annotations

import logging
import os

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),  # pragma: allowlist secret
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def s3_bucket() -> str:
    return os.environ.get("S3_BUCKET", "hrms")


def presigned_put_url(key: str, content_type: str, expires_in: int = 300) -> str:
    return s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": s3_bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def presigned_get_url(key: str, expires_in: int = 3600) -> str:
    return s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s3_bucket(), "Key": key},
        ExpiresIn=expires_in,
    )


def delete_object(key: str) -> None:
    """Best-effort delete; never raises on 404."""
    try:
        s3_client().delete_object(Bucket=s3_bucket(), Key=key)
    except Exception:  # boto3 ClientError, network, etc.
        logger.exception("avatar.delete_object failed for key=%s", key)
