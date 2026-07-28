"""BalanceService — orchestrates LeaveBalance updates + ledger appends."""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import transaction

from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.ledger import LeaveLedgerService


class BalanceService:
    @staticmethod
    @transaction.atomic
    def get_or_create(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
    ) -> LeaveBalance:
        # Use all_objects (bypasses TenantScopedManager thread-local filter)
        # because org_id is passed explicitly in the lookup fields.
        bal, _ = LeaveBalance.all_objects.get_or_create(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
            deleted_at__isnull=True,
            defaults={
                "entitled": Decimal("0"),
                "accrued": Decimal("0"),
                "taken": Decimal("0"),
                "pending": Decimal("0"),
                "carried_forward": Decimal("0"),
            },
        )
        return bal

    @staticmethod
    @transaction.atomic
    def accrue(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
        reason: str = "accrual",
        reference_type: str | None = None,
        reference_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
        )
        # Idempotent ledger append. If a reference is supplied and a row exists,
        # we DO NOT mutate the balance again — count BEFORE appending.
        existing_count = 0
        if reference_type is not None and reference_id is not None:
            existing_count = LeaveBalanceLedger.objects.filter(
                reference_type=reference_type,
                reference_id=reference_id,
                reason=reason,
            ).count()

        LeaveLedgerService.append(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            delta=days,
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
            actor_id=actor_id,
        )

        if existing_count == 0:
            bal.accrued = bal.accrued + days
            if reason == "accrual":
                bal.entitled = bal.entitled + days
            bal.save(update_fields=["accrued", "entitled", "updated_at"])

        bal.refresh_from_db()
        return bal

    @staticmethod
    @transaction.atomic
    def hold_pending(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
        )
        bal.pending = bal.pending + days
        bal.save(update_fields=["pending", "updated_at"])
        return bal

    @staticmethod
    @transaction.atomic
    def release_pending(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
        )
        bal.pending = max(Decimal("0"), bal.pending - days)
        bal.save(update_fields=["pending", "updated_at"])
        return bal

    @staticmethod
    @transaction.atomic
    def deduct(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
        reference_type: str,
        reference_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        """Move days from ``pending`` to ``taken`` and append a ledger row."""
        bal = BalanceService.get_or_create(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
        )
        bal.pending = max(Decimal("0"), bal.pending - days)
        bal.taken = bal.taken + days
        bal.save(update_fields=["pending", "taken", "updated_at"])
        LeaveLedgerService.append(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            delta=-days,
            reason="request_approved",
            reference_type=reference_type,
            reference_id=reference_id,
            actor_id=actor_id,
        )
        return bal

    @staticmethod
    def manual_adjust(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        delta: Decimal,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        """HR one-off balance correction (+/-), recorded as a manual_adjustment ledger row.

        A fresh reference_id per call defeats idempotency dedup, so every adjustment applies.
        """
        return BalanceService.accrue(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
            days=delta,
            reason="manual_adjustment",
            reference_type="manual",
            reference_id=uuid.uuid4(),
            actor_id=actor_id,
        )

    @staticmethod
    def grant_replacement(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
        reference_type: str,
        reference_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        """Idempotent grant for HolidayWorkConfirmed."""
        already = LeaveBalanceLedger.objects.filter(
            reference_type=reference_type,
            reference_id=reference_id,
            reason="holiday_replacement",
        ).exists()
        bal = BalanceService.accrue(
            org_id=org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=year,
            days=days,
            reason="holiday_replacement",
            reference_type=reference_type,
            reference_id=reference_id,
            actor_id=actor_id,
        )
        if not already:
            BalanceService._notify_replacement(org_id, employee_id, leave_type, year, days)
        return bal

    @staticmethod
    def _notify_replacement(
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        year: int,
        days: Decimal,
    ) -> None:
        import logging

        logger = logging.getLogger(__name__)
        try:
            from modules.employee.models import Employee
            from modules.notification.services.notify import notify

            emp = Employee.all_objects.filter(id=employee_id).first()
            user = getattr(emp, "user", None) if emp else None
            if user is None:
                return
            notify(
                user=user,
                type="leave.replacement_granted",
                payload={"leave_type": leave_type.code, "year": year, "days": str(days)},
                deep_link="/leave/me",
                priority="normal",
            )
        except Exception:
            logger.exception(
                "Failed to notify replacement grant for employee %s", employee_id
            )
