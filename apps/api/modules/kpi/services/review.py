"""KPI ReviewService — submit-self, submit-manager, evidence upload."""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import boto3
from botocore.config import Config

from common import audit
from common.workflow.exceptions import InvalidTransition

from ..models import KpiAssignment, KpiReview, KpiReviewIteration

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


def _next_iteration(assignment: KpiAssignment, stage: str) -> int:
    """Return max(iteration) + 1 for (assignment, stage), default 1."""
    from django.db.models import Max

    result = KpiReview.objects.filter(assignment=assignment, stage=stage).aggregate(
        Max("iteration")
    )
    max_iter = result["iteration__max"]
    return (max_iter + 1) if max_iter is not None else 1


class ReviewService:
    @staticmethod
    def submit_self(
        assignment: KpiAssignment,
        *,
        submitted_by: uuid.UUID,
        scores: dict[str, Any],
        overall_comment: str = "",
        evidence: list[str] | None = None,
    ) -> KpiReview:
        """Submit a self-review.

        Guard: cycle.status must be 'self_review'.
        """
        cycle = assignment.cycle
        if cycle.status != "self_review":
            raise InvalidTransition(f"Self-review not open: cycle is in '{cycle.status}' status")

        iteration = _next_iteration(assignment, "self")
        review = KpiReview.objects.create(
            assignment=assignment,
            stage="self",
            iteration=iteration,
            scores=scores,
            overall_comment=overall_comment,
            evidence=evidence or [],
            submitted_by=submitted_by,
        )
        KpiReviewIteration.objects.create(
            review=review,
            change_summary={"action": "submit_self", "iteration": iteration},
        )

        assignment.status = "self_done"
        assignment.save(update_fields=["status", "updated_at"])

        audit.append(
            org_id=assignment.org_id,
            action="kpi.review.submit_self",
            entity="KpiReview",
            entity_id=assignment.id,
            after={"stage": "self", "iteration": iteration, "review_id": review.id},
            actor_id=submitted_by,
        )
        return review

    @staticmethod
    def submit_manager(
        assignment: KpiAssignment,
        *,
        submitted_by: uuid.UUID,
        scores: dict[str, Any],
        overall_comment: str = "",
    ) -> KpiReview:
        """Submit a manager-review.

        Guard: cycle.status must be 'manager_review' AND assignment.status must be 'self_done'.
        """
        cycle = assignment.cycle
        if cycle.status != "manager_review":
            raise InvalidTransition(f"Manager-review not open: cycle is in '{cycle.status}' status")
        if assignment.status != "self_done":
            raise InvalidTransition(
                f"Cannot submit manager review: assignment status is '{assignment.status}'"
                " (requires 'self_done')"
            )

        iteration = _next_iteration(assignment, "manager")
        review = KpiReview.objects.create(
            assignment=assignment,
            stage="manager",
            iteration=iteration,
            scores=scores,
            overall_comment=overall_comment,
            evidence=[],
            submitted_by=submitted_by,
        )
        KpiReviewIteration.objects.create(
            review=review,
            change_summary={"action": "submit_manager", "iteration": iteration},
        )

        assignment.status = "manager_done"
        assignment.save(update_fields=["status", "updated_at"])

        audit.append(
            org_id=assignment.org_id,
            action="kpi.review.submit_manager",
            entity="KpiReview",
            entity_id=assignment.id,
            after={"stage": "manager", "iteration": iteration, "review_id": review.id},
            actor_id=submitted_by,
        )
        return review

    @staticmethod
    def submit_evidence(
        review: KpiReview,
        *,
        filename: str,
        content_type: str,
    ) -> dict[str, Any]:
        """Generate a presigned S3 PUT URL for evidence upload.

        Returns {presigned_url, s3_key}.
        The caller must register the s3_key into review.evidence after upload.
        """
        s3_key = f"kpi/reviews/{review.assignment_id}/{review.id}/{uuid.uuid4()}_{filename}"
        url = _s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _bucket(),
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=300,
        )
        return {"presigned_url": url, "s3_key": s3_key}

    @staticmethod
    def register_evidence(review: KpiReview, *, s3_key: str) -> KpiReview:
        """Append a registered s3_key to review.evidence."""
        evidence = list(review.evidence)
        evidence.append(s3_key)
        review.evidence = evidence
        review.save(update_fields=["evidence"])
        return review
