"""AuditLog and PayrollAuditLedger model basics."""

import uuid

import pytest

from common.audit.models import AuditLog, PayrollAuditLedger


@pytest.mark.django_db
def test_auditlog_minimal_fields() -> None:
    org_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    row = AuditLog.objects.create(
        org_id=org_id,
        actor_id=None,
        action="leave.request.approve",
        entity="leave_requests",
        entity_id=entity_id,
        before={"status": "submitted"},
        after={"status": "approved"},
    )
    assert row.id is not None
    assert row.org_id == org_id
    assert row.before["status"] == "submitted"


@pytest.mark.django_db
def test_payroll_ledger_seq_assigned_on_insert() -> None:
    org_id = uuid.uuid4()
    row = PayrollAuditLedger.objects.create(
        org_id=org_id,
        actor_id=None,
        action="employee.salary.update",
        entity="employees",
        entity_id=uuid.uuid4(),
        payload={"before": {"salary": 1000}, "after": {"salary": 1100}},
        prev_hash="0" * 64,
        row_hash="a" * 64,
    )
    assert row.seq is not None
    assert row.seq >= 1
