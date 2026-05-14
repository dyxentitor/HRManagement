"""Certification service — CRUD helpers and S3 presigned upload."""

from __future__ import annotations

import uuid


def get_presigned_upload_url(cert_id: uuid.UUID, content_type: str = "application/pdf") -> dict:
    """Return a presigned S3 PUT URL for uploading a certification document.

    Falls back to a placeholder URL when S3 is not configured (dev/test).
    """
    s3_key = f"certifications/{cert_id}/document.pdf"
    try:
        from common.storage.s3 import bucket, public_s3_client

        url = public_s3_client().generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket(), "Key": s3_key, "ContentType": content_type},
            ExpiresIn=3600,
        )
    except Exception:
        url = f"https://s3.example.local/{s3_key}?presigned=1"
    return {"upload_url": url, "s3_key": s3_key}


def register_document(cert, s3_key: str) -> None:
    """Record the S3 key on the cert after a successful direct upload."""
    cert.document_s3_key = s3_key
    cert.save(update_fields=["document_s3_key", "updated_at"])
    from common.audit import append

    append(
        org_id=cert.org_id,
        action="certification.document_registered",
        entity="certifications",
        entity_id=cert.id,
        before=None,
        after={"s3_key": s3_key},
    )
