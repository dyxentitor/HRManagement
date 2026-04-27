"""audit.append + payroll-ledger helpers."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from django.db import transaction
from django.utils import timezone

from .middleware import (
    get_current_actor_id,
    get_current_ip,
    get_current_user_agent,
)
from .models import AuditLog, PayrollAuditLedger

GENESIS_HASH = "0" * 64


def append(
    *,
    org_id: uuid.UUID,
    action: str,
    entity: str,
    entity_id: uuid.UUID,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    actor_id: uuid.UUID | None = None,
) -> AuditLog:
    """Write a single Tier-1 audit-log row.

    Actor / ip / user_agent are pulled from the AuditContext middleware unless
    overridden by `actor_id`. `before` and `after` are stored as JSONB.
    """
    return AuditLog.objects.create(
        org_id=org_id,
        actor_id=actor_id if actor_id is not None else get_current_actor_id(),
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
        ip=get_current_ip(),
        user_agent=get_current_user_agent(),
    )


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def append_payroll(
    *,
    org_id: uuid.UUID,
    action: str,
    entity: str,
    entity_id: uuid.UUID,
    payload: dict[str, Any],
    actor_id: uuid.UUID | None = None,
) -> PayrollAuditLedger:
    """Write to the chained payroll ledger. Computes prev_hash + row_hash atomically.

    M1: stays unused. M6 (Payroll) wires this up alongside payslip publish.
    """
    actor = actor_id if actor_id is not None else get_current_actor_id()
    with transaction.atomic():
        last = PayrollAuditLedger.objects.order_by("-seq").first()
        prev_hash = last.row_hash if last else GENESIS_HASH

        ts = timezone.now()
        material = (
            prev_hash + _canonical(payload) + (str(actor) if actor else "") + ts.isoformat()
        ).encode("utf-8")
        row_hash = hashlib.sha256(material).hexdigest()

        return PayrollAuditLedger.objects.create(
            org_id=org_id,
            actor_id=actor,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload,
            prev_hash=prev_hash,
            row_hash=row_hash,
            ts=ts,
        )


def verify_payroll_chain() -> tuple[bool, int | None]:
    """Recompute hashes from genesis to head. Returns (verified, broken_at_seq_or_None)."""
    prev = GENESIS_HASH
    for row in PayrollAuditLedger.objects.order_by("seq"):
        material = (
            prev
            + _canonical(row.payload)
            + (str(row.actor_id) if row.actor_id else "")
            + row.ts.isoformat()
        ).encode("utf-8")
        expected = hashlib.sha256(material).hexdigest()
        if expected != row.row_hash:
            return False, row.seq
        prev = row.row_hash
    return True, None
