"""attendance.attendance_clocked + handler that grants replacement leave for shift workers."""

from __future__ import annotations

from decimal import Decimal

from django.dispatch import Signal as DSignal
from django.dispatch import receiver

attendance_clocked = DSignal()  # kwargs: record, kind ("in" | "out")


@receiver(attendance_clocked)
def _on_clocked_grant_replacement(sender, record, kind, **kwargs) -> None:
    """When a SHIFT worker clocks in on a holiday, grant +1 REPLACEMENT leave.

    Idempotent: BalanceService keys on (reference_type, reference_id, reason).
    """
    if kind != "in":
        return
    if not record.is_holiday_work:
        return
    if record.employee.schedule_type != "shift":
        return

    # Find or skip if no REPLACEMENT type configured for this org.
    from modules.leave.models import LeaveType

    rep_type = LeaveType.all_objects.filter(
        org_id=record.org_id,
        code="REPLACEMENT",
        deleted_at__isnull=True,
    ).first()
    if rep_type is None:
        return

    from modules.leave.services.balance import BalanceService

    BalanceService.grant_replacement(
        org_id=record.org_id,
        employee_id=record.employee_id,
        leave_type=rep_type,
        year=record.work_date.year,
        days=Decimal("1"),
        reference_type="attendance_record",
        reference_id=record.id,
    )
