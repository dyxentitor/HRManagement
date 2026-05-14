"""Avatar S3 helpers — presigned PUT/GET + delete (mirror of claims/services/attachment.py).

Used by EmployeeViewSet's photo actions and the process_avatar_upload task.
"""

from __future__ import annotations

import logging

from common.storage.s3 import bucket as s3_bucket
from common.storage.s3 import internal_s3_client, public_s3_client

logger = logging.getLogger(__name__)

PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


def s3_client():
    """Back-compat shim — internal-network client for server-side ops.

    New code should call ``common.storage.s3.internal_s3_client`` (server-side
    ops) or ``public_s3_client`` (signing browser-facing URLs) directly.
    """
    return internal_s3_client()


def presigned_put_url(key: str, content_type: str, expires_in: int = 300) -> str:
    return public_s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": s3_bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def presigned_get_url(key: str, expires_in: int = 3600) -> str:
    return public_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s3_bucket(), "Key": key},
        ExpiresIn=expires_in,
    )


def delete_object(key: str) -> None:
    """Best-effort delete; never raises on 404.

    Routed through the local ``s3_client`` shim so tests that patch this
    name observe the call (the avatar Celery task suite relies on this).
    """
    try:
        s3_client().delete_object(Bucket=s3_bucket(), Key=key)
    except Exception:  # boto3 ClientError, network, etc.
        logger.exception("avatar.delete_object failed for key=%s", key)
