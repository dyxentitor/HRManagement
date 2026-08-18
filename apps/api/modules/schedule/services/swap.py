"""Shift-swap validation and execution.

Mechanic: exchange the (work_date, shift_id) pair between the two assignment
rows. Each employee keeps their own row, so no swap shape ever produces a
transient violation of the (employee, work_date) partial unique index, and
row metadata (notes, assigned_by) stays with its owner.

See docs/superpowers/specs/2026-08-18-shift-swap-design.md §5-§6.
"""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from ..models import ShiftAssignment, ShiftSwapRequest


class SwapValidationError(Exception):
    """A swap that breaks one of the spec §6 rules."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _conflict(employee, target_date, exclude_assignment_id):
    """Return the row blocking `employee` from taking `target_date`, if any."""
    return (
        ShiftAssignment.all_objects.filter(
            employee=employee,
            work_date=target_date,
            deleted_at__isnull=True,
        )
        .exclude(id=exclude_assignment_id)
        .select_related("shift")
        .first()
    )


def validate_pair(*, requester_assignment, counterparty_assignment, requester) -> None:
    """Raise SwapValidationError unless this swap is legal. Spec §6."""
    a1 = requester_assignment
    a2 = counterparty_assignment

    # 1. ownership + distinct parties
    if a1.employee_id != requester.id:
        raise SwapValidationError("You can only swap your own shift.")
    if a2.employee_id == requester.id:
        raise SwapValidationError("You cannot swap with yourself.")

    # 4. not the same slot
    if a1.work_date == a2.work_date and a1.shift_id == a2.shift_id:
        raise SwapValidationError("Both shifts are already the same date and shift.")

    # 2. future dates, KL-local
    today = timezone.localdate()
    for a in (a1, a2):
        if a.work_date <= today:
            raise SwapValidationError("Only future shifts can be swapped.")

    # 3. published + scheduled
    for a in (a1, a2):
        if a.published_at is None:
            raise SwapValidationError("Only published shifts can be swapped.")
        if a.status != "scheduled":
            raise SwapValidationError("Only scheduled shifts can be swapped.")

    # 5. conflicts — same-date swaps are exempt because neither date changes
    if a1.work_date != a2.work_date:
        blocker = _conflict(a1.employee, a2.work_date, a2.id)
        if blocker is not None:
            raise SwapValidationError(
                f"{a1.employee.employee_code} is already rostered on "
                f"{a2.work_date} ({blocker.shift.name}). Swap not possible."
            )
        blocker = _conflict(a2.employee, a1.work_date, a1.id)
        if blocker is not None:
            raise SwapValidationError(
                f"{a2.employee.employee_code} is already rostered on "
                f"{a1.work_date} ({blocker.shift.name}). Swap not possible."
            )

    # 6. no existing pending request touching either row
    exists = ShiftSwapRequest.all_objects.filter(
        status="pending",
        deleted_at__isnull=True,
    ).filter(
        Q(requester_assignment_id__in=(a1.id, a2.id))
        | Q(counterparty_assignment_id__in=(a1.id, a2.id))
    ).exists()
    if exists:
        raise SwapValidationError("There is already a pending swap for one of these shifts.")
