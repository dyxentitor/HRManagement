"""Centralised boto3 S3 client factories.

Two clients exist because presigned URLs bake the configured ``endpoint_url``
into the signed URL, and that URL must be reachable by whoever will use it:

* ``internal_s3_client()`` uses ``S3_ENDPOINT_URL`` — the address the API and
  Celery workers use to reach S3/MinIO from inside the Docker network
  (e.g. ``http://minio:9000``). Use it for ``put_object`` / ``get_object`` /
  ``head_object`` / ``delete_object`` and any other server-side operation
  the API performs itself.

* ``public_s3_client()`` uses ``S3_PUBLIC_ENDPOINT_URL`` (falling back to
  ``S3_ENDPOINT_URL`` when unset) — the address the **browser** will use to
  follow the presigned URL (e.g. ``http://localhost:9000`` in dev,
  ``https://s3.example.com`` in prod). Use it ONLY for
  ``generate_presigned_url``.

In production where the API and the browser hit the same hostname, leaving
``S3_PUBLIC_ENDPOINT_URL`` unset is correct — the fallback gives both clients
the same endpoint. In dev (Docker Compose) the two must differ because the
browser can't resolve the ``minio`` service hostname.
"""

from __future__ import annotations

import os

import boto3
from botocore.config import Config


def _common_kwargs() -> dict[str, object]:
    return {
        "aws_access_key_id": os.environ.get("S3_ACCESS_KEY"),
        "aws_secret_access_key": os.environ.get("S3_SECRET_KEY"),  # pragma: allowlist secret
        "region_name": os.environ.get("S3_REGION", "us-east-1"),
        "config": Config(signature_version="s3v4"),
    }


def internal_s3_client():  # type: ignore[no-untyped-def]
    """Client for server-side ops; uses ``S3_ENDPOINT_URL``."""
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        **_common_kwargs(),
    )


def public_s3_client():  # type: ignore[no-untyped-def]
    """Client for signing browser-facing URLs; uses ``S3_PUBLIC_ENDPOINT_URL``.

    Falls back to ``S3_ENDPOINT_URL`` when unset so production (where both
    URLs are the same) needs no extra configuration.
    """
    return boto3.client(
        "s3",
        endpoint_url=(
            os.environ.get("S3_PUBLIC_ENDPOINT_URL") or os.environ.get("S3_ENDPOINT_URL") or None
        ),
        **_common_kwargs(),
    )


def bucket() -> str:
    return os.environ.get("S3_BUCKET", "hrms")
