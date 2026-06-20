import datetime
import uuid

import pytest

from modules.payslip.models import PayrollPeriod


@pytest.mark.django_db
def test_period_accepts_new_workflow_states():
    p = PayrollPeriod.all_objects.create(
        org_id=uuid.uuid4(),
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 6, 28),
        status="processing",
    )
    assert p.status == "processing"
    assert p.approved_at is None
    assert p.ready_at is None
    assert p.processing_started_at is None
    assert p.completed_at is None


@pytest.mark.django_db
def test_period_stage_timestamps_settable():
    now = datetime.datetime(2026, 6, 28, 9, 0, tzinfo=datetime.UTC)
    p = PayrollPeriod.all_objects.create(
        org_id=uuid.uuid4(),
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 6, 28),
        status="completed",
        completed_at=now,
    )
    p.refresh_from_db()
    assert p.status == "completed"
    assert p.completed_at == now
