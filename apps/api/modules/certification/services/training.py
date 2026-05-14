"""Training service — assignment + progress + completion helpers."""

from __future__ import annotations

import uuid

from django.utils import timezone


def complete_assignment(assignment, evidence_s3_key: str = "") -> None:
    """Mark a training assignment as completed."""
    from common.audit import append

    assignment.status = "completed"
    assignment.completed_at = timezone.now()
    if evidence_s3_key:
        assignment.evidence_s3_key = evidence_s3_key
    assignment.save(update_fields=["status", "completed_at", "evidence_s3_key", "updated_at"])
    append(
        org_id=assignment.org_id,
        action="training.assignment_completed",
        entity="training_assignments",
        entity_id=assignment.id,
        before=None,
        after={"status": "completed", "evidence_s3_key": evidence_s3_key},
    )


def get_presigned_evidence_url(
    assignment_id: uuid.UUID, content_type: str = "application/pdf"
) -> dict:
    """Return a presigned S3 PUT URL for uploading training evidence."""
    s3_key = f"training/{assignment_id}/evidence.pdf"
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
