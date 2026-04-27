"""Tests for CycleService state machine and AssignmentService snapshot."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from common.workflow.exceptions import InvalidTransition
from modules.kpi.models import KpiAssignment, KpiCycle, KpiDefinition, KpiTemplate
from modules.kpi.services.assignment import AssignmentService, _snapshot_definitions
from modules.kpi.services.cycle import VALID_TRANSITIONS, CycleService

ORG_ID = uuid.uuid4()


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def template() -> KpiTemplate:
    t = KpiTemplate.all_objects.create(org_id=ORG_ID, name="Eng KPIs")
    KpiDefinition.objects.create(
        template=t,
        code="VELOCITY",
        name="Sprint Velocity",
        metric_type="numeric",
        target=Decimal("80"),
        weight=Decimal("1.5"),
    )
    KpiDefinition.objects.create(
        template=t,
        code="QUALITY",
        name="Code Quality",
        metric_type="rating",
        target=Decimal("4.5"),
        weight=Decimal("1.0"),
    )
    return t


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


# ── CycleService ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_cycle_valid_transition_upcoming_to_self_review(cycle: KpiCycle) -> None:
    result = CycleService.transition(cycle, "self_review")
    assert result.status == "self_review"
    cycle.refresh_from_db()
    assert cycle.status == "self_review"


@pytest.mark.django_db
def test_cycle_valid_transition_self_review_to_manager_review(cycle: KpiCycle) -> None:
    cycle.status = "self_review"
    cycle.save()
    CycleService.transition(cycle, "manager_review")
    cycle.refresh_from_db()
    assert cycle.status == "manager_review"


@pytest.mark.django_db
def test_cycle_valid_transition_manager_review_to_closed(cycle: KpiCycle) -> None:
    cycle.status = "manager_review"
    cycle.save()
    CycleService.transition(cycle, "closed")
    cycle.refresh_from_db()
    assert cycle.status == "closed"


@pytest.mark.django_db
def test_cycle_invalid_transition_skip_raises(cycle: KpiCycle) -> None:
    # upcoming → manager_review is not valid
    with pytest.raises(InvalidTransition):
        CycleService.transition(cycle, "manager_review")


@pytest.mark.django_db
def test_cycle_invalid_transition_closed_raises(cycle: KpiCycle) -> None:
    cycle.status = "closed"
    cycle.save()
    with pytest.raises(InvalidTransition):
        CycleService.transition(cycle, "self_review")


@pytest.mark.django_db
def test_cycle_invalid_transition_backwards_raises(cycle: KpiCycle) -> None:
    cycle.status = "manager_review"
    cycle.save()
    with pytest.raises(InvalidTransition):
        CycleService.transition(cycle, "self_review")


def test_valid_transitions_dict() -> None:
    assert VALID_TRANSITIONS["upcoming"] == {"self_review"}
    assert VALID_TRANSITIONS["self_review"] == {"manager_review"}
    assert VALID_TRANSITIONS["manager_review"] == {"closed"}
    assert VALID_TRANSITIONS["closed"] == set()


# ── AssignmentService ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_bulk_assign_creates_one_per_employee(cycle: KpiCycle, template: KpiTemplate) -> None:
    emp_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    n = AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=emp_ids)
    assert n == 3
    assert KpiAssignment.all_objects.filter(cycle=cycle).count() == 3


@pytest.mark.django_db
def test_bulk_assign_snapshot_contains_definitions(cycle: KpiCycle, template: KpiTemplate) -> None:
    emp_id = uuid.uuid4()
    AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=[emp_id])
    assignment = KpiAssignment.all_objects.get(cycle=cycle, employee_id=emp_id)
    codes = {d["code"] for d in assignment.kpis}
    assert codes == {"VELOCITY", "QUALITY"}


@pytest.mark.django_db
def test_bulk_assign_snapshot_decimal_as_str(cycle: KpiCycle, template: KpiTemplate) -> None:
    emp_id = uuid.uuid4()
    AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=[emp_id])
    assignment = KpiAssignment.all_objects.get(cycle=cycle, employee_id=emp_id)
    for defn in assignment.kpis:
        if defn["code"] == "VELOCITY":
            assert defn["target"] == "80.00"
            assert defn["weight"] == "1.50"
        elif defn["code"] == "QUALITY":
            assert defn["target"] == "4.50"
            assert defn["weight"] == "1.00"


@pytest.mark.django_db
def test_bulk_assign_snapshot_frozen_after_template_edit(
    cycle: KpiCycle, template: KpiTemplate
) -> None:
    """Editing template definitions after assignment MUST NOT change the snapshot."""
    emp_id = uuid.uuid4()
    AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=[emp_id])
    # Now mutate the template definition
    defn = template.definitions.get(code="VELOCITY")
    defn.target = Decimal("999")
    defn.save()

    assignment = KpiAssignment.all_objects.get(cycle=cycle, employee_id=emp_id)
    velocity_snap = next(d for d in assignment.kpis if d["code"] == "VELOCITY")
    # Snapshot should still be the original value
    assert velocity_snap["target"] == "80.00"


@pytest.mark.django_db
def test_bulk_assign_idempotent(cycle: KpiCycle, template: KpiTemplate) -> None:
    """Re-assigning the same employee creates no duplicate."""
    emp_id = uuid.uuid4()
    n1 = AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=[emp_id])
    n2 = AssignmentService.bulk_assign(cycle=cycle, template=template, employee_ids=[emp_id])
    assert n1 == 1
    assert n2 == 0
    assert KpiAssignment.all_objects.filter(cycle=cycle, employee_id=emp_id).count() == 1


@pytest.mark.django_db
def test_snapshot_definitions_no_definitions(template: KpiTemplate) -> None:
    """Template with no definitions returns empty snapshot."""
    template.definitions.all().delete()
    snap = _snapshot_definitions(template)
    assert snap == []
