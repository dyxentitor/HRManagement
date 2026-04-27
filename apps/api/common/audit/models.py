"""Audit log models — one tier-1 log + one append-only chained payroll ledger."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    """Tier-1 audit log per spec §3 / Q17 lock.

    Captures consequential actions (leave/claim/KPI submits & approvals,
    role grants, salary/bank/IC/tax changes — wherever a service emits
    `audit.append(...)`).
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=1024, null=True, blank=True)  # noqa: DJ001
    ts = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "audit_log"
        indexes: ClassVar = [
            models.Index(fields=["org_id", "-ts"], name="audit_log_org_ts"),
            models.Index(fields=["entity", "entity_id", "-ts"], name="audit_log_entity_ts"),
            models.Index(fields=["actor_id", "-ts"], name="audit_log_actor_ts"),
        ]

    def __str__(self) -> str:
        return f"AuditLog({self.action} on {self.entity}:{self.entity_id})"


class PayrollAuditLedger(models.Model):
    """Append-only, hash-chained ledger for salary / bank / IC / tax / payroll changes.

    A DB trigger (added in 0002 migration) raises on UPDATE/DELETE so this table
    is genuinely append-only — even via the ORM. The hash chain is recomputed
    on demand via `audit.verify_payroll_chain()`.

    M1: created but unused. M6 (Payroll) starts writing to it.
    """

    seq = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    actor_id = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    payload = models.JSONField()
    prev_hash = models.CharField(max_length=64)
    row_hash = models.CharField(max_length=64)
    ts = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "payroll_audit_ledger"
        indexes: ClassVar = [
            models.Index(fields=["org_id", "seq"], name="payroll_ledger_org_seq"),
        ]

    def __str__(self) -> str:
        return f"PayrollAuditLedger(seq={self.seq}, action={self.action})"
