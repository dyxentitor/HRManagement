"""LeaveLedgerService — append-only writes with reference-based idempotency."""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction

from modules.leave.models import LeaveBalanceLedger, LeaveType


class LeaveLedgerService:
    @staticmethod
    @transaction.atomic
    def append(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        delta: Decimal,
        reason: str,
        reference_type: str | None = None,
        reference_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalanceLedger:
        """Append a ledger row.

        If ``reference_type + reference_id`` is provided AND a row already exists
        for that (reference_type, reference_id, reason) tuple, return that
        existing row instead of inserting (idempotency).
        """
        if reference_type is not None and reference_id is not None:
            existing = LeaveBalanceLedger.objects.filter(
                reference_type=reference_type,
                reference_id=reference_id,
                reason=reason,
            ).first()
            if existing is not None:
                return existing

        try:
            return LeaveBalanceLedger.objects.create(
                org_id=org_id,
                employee_id=employee_id,
                leave_type=leave_type,
                delta=delta,
                reason=reason,
                reference_type=reference_type,
                reference_id=reference_id,
                actor_id=actor_id,
            )
        except IntegrityError:
            # Race: another transaction inserted just now. Return the existing row.
            if reference_type is not None and reference_id is not None:
                return LeaveBalanceLedger.objects.get(
                    reference_type=reference_type,
                    reference_id=reference_id,
                    reason=reason,
                )
            raise
