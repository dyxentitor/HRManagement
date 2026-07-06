"""KPI ReviewService — submit-self, submit-manager, evidence upload."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from common import audit
from common.storage.s3 import bucket as _bucket
from common.storage.s3 import public_s3_client
from common.workflow.exceptions import InvalidTransition

from ..models import KpiAssignment, KpiReview, KpiReviewIteration

logger = logging.getLogger(__name__)


def _notify_manager_for_review(assignment: KpiAssignment, notif_type: str) -> None:
    """Best-effort: notify the employee's direct manager after self-review submitted."""
    try:
        from modules.employee.models import Employee
        from modules.notification.services.notify import notify

        emp = Employee.all_objects.filter(id=assignment.employee_id).first()
        if emp is None or emp.manager is None:
            return
        mgr_user = getattr(emp.manager, "user", None)
        if mgr_user is None:
            return
        notify(
            user=mgr_user,
            type=notif_type,
            payload={"assignment_id": str(assignment.id)},
            deep_link="/kpi/admin",
            priority="high",
        )
    except Exception:
        logger.exception(
            "Failed to send %s notification for assignment %s", notif_type, assignment.id
        )


def _notify_employee_for_review(assignment: KpiAssignment, notif_type: str) -> None:
    """Best-effort: notify the employee after manager review submitted."""
    try:
        from modules.employee.models import Employee
        from modules.notification.services.notify import notify

        emp = Employee.all_objects.filter(id=assignment.employee_id).first()
        if emp is None:
            return
        emp_user = getattr(emp, "user", None)
        if emp_user is None:
            return
        notify(
            user=emp_user,
            type=notif_type,
            payload={"assignment_id": str(assignment.id)},
            deep_link="/kpi/me",
        )
    except Exception:
        logger.exception(
            "Failed to send %s notification for assignment %s", notif_type, assignment.id
        )


def _s3_client():
    """Back-compat shim — kept so existing tests can patch this name."""
    return public_s3_client()


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
        # Notify the employee's manager that a self-review was submitted
        _notify_manager_for_review(assignment, "kpi.review_submitted_self")
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
        # Notify the employee that their manager review was submitted
        _notify_employee_for_review(assignment, "kpi.review_submitted_manager")
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
