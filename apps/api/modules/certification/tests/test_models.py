"""Model tests for the certification module — Certification, TrainingPlan,
TrainingAssignment, TrainingProgress."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.db import IntegrityError

from modules.certification.models import (
    Certification,
    TrainingAssignment,
    TrainingPlan,
    TrainingProgress,
)

ORG_ID = uuid.uuid4()
EMP_ID = uuid.uuid4()


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def cert() -> Certification:
    return Certification.all_objects.create(
        org_id=ORG_ID,
        employee_id=EMP_ID,
        name="AWS Solutions Architect",
        issuer="Amazon",
        certificate_number="AWS-SA-12345",
        issued_on="2025-01-01",
        expires_on="2028-01-01",
        status="active",
    )


@pytest.fixture
def plan() -> TrainingPlan:
    return TrainingPlan.all_objects.create(
        org_id=ORG_ID,
        name="Safety Training",
        description="Annual safety compliance training",
    )


@pytest.fixture
def assignment(plan: TrainingPlan) -> TrainingAssignment:
    return TrainingAssignment.all_objects.create(
        org_id=ORG_ID,
        plan=plan,
        employee_id=EMP_ID,
        assigned_by=uuid.uuid4(),
        due_date="2026-06-30",
        status="assigned",
    )


# ── Certification tests ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_certification_str(cert: Certification) -> None:
    assert "AWS Solutions Architect" in str(cert)
    assert str(EMP_ID) in str(cert)


@pytest.mark.django_db
def test_certification_default_status(cert: Certification) -> None:
    assert cert.status == "active"


@pytest.mark.django_db
def test_certification_reminder_flags_default_false(cert: Certification) -> None:
    assert cert.reminder_sent_30d is False
    assert cert.reminder_sent_60d is False
    assert cert.reminder_sent_90d is False


@pytest.mark.django_db
def test_certification_soft_delete(cert: Certification) -> None:
    cert.delete()
    assert Certification.objects.filter(id=cert.id).count() == 0
    assert Certification.all_objects.filter(id=cert.id).count() == 1


# ── TrainingPlan tests ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_training_plan_str(plan: TrainingPlan) -> None:
    assert plan.name in str(plan)


# ── TrainingAssignment tests ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_training_assignment_str(assignment: TrainingAssignment) -> None:
    s = str(assignment)
    assert "Safety Training" in s
    assert "assigned" in s


@pytest.mark.django_db
def test_training_assignment_unique_plan_employee(plan: TrainingPlan) -> None:
    TrainingAssignment.all_objects.create(
        org_id=ORG_ID,
        plan=plan,
        employee_id=EMP_ID,
        assigned_by=uuid.uuid4(),
        due_date="2026-06-30",
    )
    with pytest.raises(IntegrityError):
        TrainingAssignment.all_objects.create(
            org_id=ORG_ID,
            plan=plan,
            employee_id=EMP_ID,
            assigned_by=uuid.uuid4(),
            due_date="2026-07-31",
        )


@pytest.mark.django_db
def test_training_assignment_same_plan_different_employee(plan: TrainingPlan) -> None:
    emp2 = uuid.uuid4()
    TrainingAssignment.all_objects.create(
        org_id=ORG_ID,
        plan=plan,
        employee_id=EMP_ID,
        assigned_by=uuid.uuid4(),
        due_date="2026-06-30",
    )
    # Different employee — should not raise
    TrainingAssignment.all_objects.create(
        org_id=ORG_ID,
        plan=plan,
        employee_id=emp2,
        assigned_by=uuid.uuid4(),
        due_date="2026-06-30",
    )
    assert TrainingAssignment.all_objects.filter(plan=plan).count() == 2


# ── TrainingProgress tests ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_training_progress_creation(assignment: TrainingAssignment) -> None:
    progress = TrainingProgress.objects.create(
        assignment=assignment,
        progress_pct=Decimal("50.00"),
        notes="Half way done",
    )
    assert progress.assignment == assignment
    assert progress.progress_pct == Decimal("50.00")
    assert progress.notes == "Half way done"
    assert progress.ts is not None
