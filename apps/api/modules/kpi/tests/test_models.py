"""Model tests for KPI module — 6 models + constraints."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.db import IntegrityError

from modules.kpi.models import (
    KpiAssignment,
    KpiCycle,
    KpiDefinition,
    KpiReview,
    KpiReviewIteration,
    KpiTemplate,
)

ORG_ID = uuid.uuid4()


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def template() -> KpiTemplate:
    return KpiTemplate.all_objects.create(
        org_id=ORG_ID, name="Engineering KPIs", description="Eng quarterly KPIs"
    )


@pytest.fixture
def definition(template: KpiTemplate) -> KpiDefinition:
    return KpiDefinition.objects.create(
        template=template,
        code="CODE_QUALITY",
        name="Code Quality",
        metric_type="rating",
        target=Decimal("4.5"),
        weight=Decimal("1.0"),
    )


@pytest.fixture
def cycle() -> KpiCycle:
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
def assignment(cycle: KpiCycle, template: KpiTemplate) -> KpiAssignment:
    emp_id = uuid.uuid4()
    return KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle,
        employee_id=emp_id,
        template=template,
        kpis=[{"code": "CODE_QUALITY", "weight": "1.0"}],
        status="pending",
    )


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_kpi_template_str(template: KpiTemplate) -> None:
    assert "Engineering KPIs" in str(template)


@pytest.mark.django_db
def test_kpi_definition_str(definition: KpiDefinition) -> None:
    assert "CODE_QUALITY" in str(definition)


@pytest.mark.django_db
def test_kpi_definition_unique_code_per_template(template: KpiTemplate) -> None:
    KpiDefinition.objects.create(
        template=template, code="UNIQ", name="Unique", metric_type="rating"
    )
    with pytest.raises(IntegrityError):
        KpiDefinition.objects.create(
            template=template, code="UNIQ", name="Duplicate", metric_type="numeric"
        )


@pytest.mark.django_db
def test_kpi_definition_same_code_different_template() -> None:
    t1 = KpiTemplate.all_objects.create(org_id=ORG_ID, name="T1")
    t2 = KpiTemplate.all_objects.create(org_id=ORG_ID, name="T2")
    KpiDefinition.objects.create(template=t1, code="SHARED", name="S", metric_type="rating")
    # Should NOT raise
    KpiDefinition.objects.create(template=t2, code="SHARED", name="S", metric_type="rating")
    assert KpiDefinition.objects.filter(code="SHARED").count() == 2


@pytest.mark.django_db
def test_kpi_cycle_str(cycle: KpiCycle) -> None:
    assert "Q1 2026" in str(cycle)
    assert "upcoming" in str(cycle)


@pytest.mark.django_db
def test_kpi_assignment_default_status(cycle: KpiCycle, template: KpiTemplate) -> None:
    assignment = KpiAssignment.all_objects.create(
        org_id=ORG_ID,
        cycle=cycle,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[],
    )
    assert assignment.status == "pending"


@pytest.mark.django_db
def test_kpi_assignment_unique_cycle_employee(cycle: KpiCycle, template: KpiTemplate) -> None:
    emp_id = uuid.uuid4()
    KpiAssignment.all_objects.create(
        org_id=ORG_ID, cycle=cycle, employee_id=emp_id, template=template, kpis=[]
    )
    with pytest.raises(IntegrityError):
        KpiAssignment.all_objects.create(
            org_id=ORG_ID, cycle=cycle, employee_id=emp_id, template=template, kpis=[]
        )


@pytest.mark.django_db
def test_kpi_review_defaults(assignment: KpiAssignment) -> None:
    review = KpiReview.objects.create(
        assignment=assignment,
        stage="self",
        iteration=1,
        scores={"CODE_QUALITY": {"score": 4.0, "comment": "Good"}},
        submitted_by=uuid.uuid4(),
    )
    assert review.iteration == 1
    assert review.stage == "self"
    assert review.evidence == []


@pytest.mark.django_db
def test_kpi_review_iteration_creation(assignment: KpiAssignment) -> None:
    review = KpiReview.objects.create(
        assignment=assignment,
        stage="self",
        iteration=1,
        scores={},
        submitted_by=uuid.uuid4(),
    )
    it = KpiReviewIteration.objects.create(review=review, change_summary={"note": "Initial review"})
    assert it.review == review
    assert it.change_summary == {"note": "Initial review"}


@pytest.mark.django_db
def test_kpi_template_soft_delete(template: KpiTemplate) -> None:
    template.delete()
    assert KpiTemplate.objects.filter(id=template.id).count() == 0
    assert KpiTemplate.all_objects.filter(id=template.id).count() == 1
