"""Tests for the append-only DB trigger and hash-chain verification."""

import uuid

import pytest
from django.db import IntegrityError, ProgrammingError, connection, transaction

from common.audit import append_payroll, verify_payroll_chain
from common.audit.models import PayrollAuditLedger

requires_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="DB trigger is postgres-only; sqlite test runs skip",
)


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_append_payroll_creates_chained_rows(org_id: uuid.UUID) -> None:
    r1 = append_payroll(
        org_id=org_id,
        action="employee.salary.update",
        entity="employees",
        entity_id=uuid.uuid4(),
        payload={"before": {"salary": 1000}, "after": {"salary": 1100}},
    )
    r2 = append_payroll(
        org_id=org_id,
        action="employee.salary.update",
        entity="employees",
        entity_id=uuid.uuid4(),
        payload={"before": {"salary": 2000}, "after": {"salary": 2100}},
    )
    assert r2.prev_hash == r1.row_hash
    assert r1.row_hash != r2.row_hash


@pytest.mark.django_db
def test_verify_chain_true_when_intact(org_id: uuid.UUID) -> None:
    for i in range(3):
        append_payroll(
            org_id=org_id,
            action=f"act.{i}",
            entity="x",
            entity_id=uuid.uuid4(),
            payload={"i": i},
        )
    ok, broken_at = verify_payroll_chain()
    assert ok is True
    assert broken_at is None


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_db_trigger_blocks_update(org_id: uuid.UUID) -> None:
    """An UPDATE on payroll_audit_ledger must raise (db trigger)."""
    row = append_payroll(
        org_id=org_id,
        action="x",
        entity="x",
        entity_id=uuid.uuid4(),
        payload={"k": "v"},
    )
    with pytest.raises((IntegrityError, ProgrammingError, Exception)):
        with transaction.atomic():
            PayrollAuditLedger.objects.filter(seq=row.seq).update(action="tampered")


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_db_trigger_blocks_delete(org_id: uuid.UUID) -> None:
    row = append_payroll(
        org_id=org_id,
        action="x",
        entity="x",
        entity_id=uuid.uuid4(),
        payload={"k": "v"},
    )
    with pytest.raises((IntegrityError, ProgrammingError, Exception)):
        with transaction.atomic():
            PayrollAuditLedger.objects.filter(seq=row.seq).delete()
