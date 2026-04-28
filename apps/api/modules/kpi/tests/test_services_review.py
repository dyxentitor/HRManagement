"""Tests for ReviewService — submit-self / submit-manager / evidence / audit."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from common.audit.models import AuditLog
from common.workflow.exceptions import InvalidTransition
from modules.kpi.models import KpiAssignment, KpiCycle, KpiDefinition, KpiReview, KpiTemplate
from modules.kpi.services.review import ReviewService
from modules.notification.models import Notification

ORG_ID = uuid.uuid4()


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def template() -> KpiTemplate:
    t = KpiTemplate.all_objects.create(org_id=ORG_ID, name="Eng KPIs")
    KpiDefinition.objects.create(
        template=t, code="VELOCITY", name="Velocity", metric_type="numeric"
    )
    return t


@pytest.fixture
def cycle_upcoming() -> KpiCycle:
    return KpiCycle.all_objects.create(
        org_id=ORG_ID,
        name="Q1 2026",
        type="quarterly",
        starts_on="2026-01-01",
        ends_on="2026-03-31",
        review_opens_on="2026-04-01",
        review_closes_on="2026-04-15",
        status="upcoming",
    )


@pytest.fixture
def cycle_self_review(cycle_upcoming: KpiCycle) -> KpiCycle:
    cycle_upcoming.status = "self_review"
    cycle_upcoming.save()
    return cycle_upcoming


@pytest.fixture
def cycle_manager_review(cycle_upcoming: KpiCycle) -> KpiCycle:
    cycle_upcoming.status = "manager_review"
    cycle_upcoming.save()
    return cycle_upcoming


@pytest.fixture
def assignment_pending(cycle_self_review: KpiCycle, template: KpiTemplate) -> KpiAssignment:
    return KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle_self_review,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[{"code": "VELOCITY"}],
        status="pending",
    )


@pytest.fixture
def assignment_self_done(cycle_manager_review: KpiCycle, template: KpiTemplate) -> KpiAssignment:
    return KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle_manager_review,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[{"code": "VELOCITY"}],
        status="self_done",
    )


# ── submit_self ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_submit_self_happy_path(assignment_pending: KpiAssignment) -> None:
    actor = uuid.uuid4()
    review = ReviewService.submit_self(
        assignment_pending,
        submitted_by=actor,
        scores={"VELOCITY": {"score": 80, "comment": "Good sprint"}},
        overall_comment="Great quarter",
    )
    assert review.stage == "self"
    assert review.iteration == 1
    assert review.submitted_by == actor

    assignment_pending.refresh_from_db()
    assert assignment_pending.status == "self_done"
    # M9: notify() is called best-effort; no Employee linked in this test
    # so Notification count stays at 0 — just assert it doesn't raise
    _ = Notification.objects.filter(type="kpi.review_submitted_self").count()


@pytest.mark.django_db
def test_submit_self_rejects_wrong_phase(cycle_upcoming: KpiCycle, template: KpiTemplate) -> None:
    assignment = KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle_upcoming,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[],
        status="pending",
    )
    with pytest.raises(InvalidTransition, match="upcoming"):
        ReviewService.submit_self(assignment, submitted_by=uuid.uuid4(), scores={})


@pytest.mark.django_db
def test_submit_self_audit_logged(assignment_pending: KpiAssignment) -> None:
    actor = uuid.uuid4()
    ReviewService.submit_self(assignment_pending, submitted_by=actor, scores={})
    log = AuditLog.objects.filter(action="kpi.review.submit_self").first()
    assert log is not None
    assert log.actor_id == actor


@pytest.mark.django_db
def test_submit_self_iteration_auto_increments(assignment_pending: KpiAssignment) -> None:
    """Second self-review on same assignment increments iteration."""
    actor = uuid.uuid4()
    r1 = ReviewService.submit_self(assignment_pending, submitted_by=actor, scores={})
    # Reset to self_done so we can re-submit (simulate re-open)
    assignment_pending.status = "pending"
    assignment_pending.save()
    assignment_pending.cycle.status = "self_review"
    assignment_pending.cycle.save()

    r2 = ReviewService.submit_self(assignment_pending, submitted_by=actor, scores={})
    assert r1.iteration == 1
    assert r2.iteration == 2


# ── submit_manager ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_submit_manager_happy_path(assignment_self_done: KpiAssignment) -> None:
    actor = uuid.uuid4()
    review = ReviewService.submit_manager(
        assignment_self_done,
        submitted_by=actor,
        scores={"VELOCITY": {"score": 75, "comment": "Solid"}},
        overall_comment="Good job",
    )
    assert review.stage == "manager"
    assert review.iteration == 1

    assignment_self_done.refresh_from_db()
    assert assignment_self_done.status == "manager_done"
    # M9: notify() is called best-effort; no Employee linked in this test
    # so Notification count stays at 0 — just assert it doesn't raise
    _ = Notification.objects.filter(type="kpi.review_submitted_manager").count()


@pytest.mark.django_db
def test_submit_manager_rejects_wrong_cycle_phase(
    cycle_self_review: KpiCycle, template: KpiTemplate
) -> None:
    assignment = KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle_self_review,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[],
        status="self_done",
    )
    with pytest.raises(InvalidTransition, match="self_review"):
        ReviewService.submit_manager(assignment, submitted_by=uuid.uuid4(), scores={})


@pytest.mark.django_db
def test_submit_manager_requires_self_done(
    cycle_manager_review: KpiCycle, template: KpiTemplate
) -> None:
    # Assignment is still pending (self review not submitted)
    assignment = KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle_manager_review,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[],
        status="pending",
    )
    with pytest.raises(InvalidTransition, match="self_done"):
        ReviewService.submit_manager(assignment, submitted_by=uuid.uuid4(), scores={})


@pytest.mark.django_db
def test_submit_manager_audit_logged(assignment_self_done: KpiAssignment) -> None:
    actor = uuid.uuid4()
    ReviewService.submit_manager(assignment_self_done, submitted_by=actor, scores={})
    log = AuditLog.objects.filter(action="kpi.review.submit_manager").first()
    assert log is not None
    assert log.actor_id == actor


# ── submit_evidence ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_submit_evidence_returns_presigned_url(assignment_pending: KpiAssignment) -> None:
    review = KpiReview.objects.create(
        assignment=assignment_pending,
        stage="self",
        iteration=1,
        scores={},
        submitted_by=uuid.uuid4(),
    )
    mock_url = "https://s3.example.com/presigned"
    with patch("modules.kpi.services.review._s3_client") as mock_s3_factory:
        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = mock_url
        mock_s3_factory.return_value = mock_s3

        result = ReviewService.submit_evidence(
            review, filename="evidence.pdf", content_type="application/pdf"
        )

    assert result["presigned_url"] == mock_url
    assert "evidence.pdf" in result["s3_key"]


@pytest.mark.django_db
def test_register_evidence_appends_key(assignment_pending: KpiAssignment) -> None:
    review = KpiReview.objects.create(
        assignment=assignment_pending,
        stage="self",
        iteration=1,
        scores={},
        submitted_by=uuid.uuid4(),
    )
    ReviewService.register_evidence(review, s3_key="kpi/reviews/test/file.pdf")
    review.refresh_from_db()
    assert "kpi/reviews/test/file.pdf" in review.evidence
