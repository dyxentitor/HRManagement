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


def validate_pair(
    *, requester_assignment, counterparty_assignment, requester, exclude_request_id=None
) -> None:
    """Raise SwapValidationError unless this swap is legal. Spec §6."""
    a1 = requester_assignment
    a2 = counterparty_assignment

    # ownership + distinct parties
    if a1.employee_id != requester.id:
        raise SwapValidationError("You can only swap your own shift.")
    if a2.employee_id == requester.id:
        raise SwapValidationError("You cannot swap with yourself.")

    # not the same slot
    if a1.work_date == a2.work_date and a1.shift_id == a2.shift_id:
        raise SwapValidationError("Both shifts are already the same date and shift.")

    # future dates, KL-local
    today = timezone.localdate()
    for a in (a1, a2):
        if a.work_date <= today:
            raise SwapValidationError("Only future shifts can be swapped.")

    # published + scheduled
    for a in (a1, a2):
        if a.published_at is None:
            raise SwapValidationError("Only published shifts can be swapped.")
        if a.status != "scheduled":
            raise SwapValidationError("Only scheduled shifts can be swapped.")

    # no date conflict — same-date swaps are exempt because neither date changes
    if a1.work_date != a2.work_date:
        blocker = _conflict(a1.employee, a2.work_date, a2.id)
        if blocker is not None:
            raise SwapValidationError(
                f"{a1.employee.employee_code} is already rostered on "
                f"{a2.work_date} ({blocker.shift.name}). Swap not possible."
            )
        blocker = _conflict(a2.employee, a1.work_date, a2.id)
        if blocker is not None:
            raise SwapValidationError(
                f"{a2.employee.employee_code} is already rostered on "
                f"{a1.work_date} ({blocker.shift.name}). Swap not possible."
            )

    # no existing pending request touching either row
    qs = ShiftSwapRequest.all_objects.filter(
        status="pending",
        deleted_at__isnull=True,
    ).filter(
        Q(requester_assignment_id__in=(a1.id, a2.id))
        | Q(counterparty_assignment_id__in=(a1.id, a2.id))
    )
    if exclude_request_id is not None:
        qs = qs.exclude(id=exclude_request_id)
    if qs.exists():
        raise SwapValidationError("There is already a pending swap for one of these shifts.")


def execute_swap(*, swap_request, actor_id, note: str = ""):
    """Approve and apply a pending swap. Atomic; re-validates under lock."""
    from django.db import transaction

    if swap_request.status != "pending":
        raise SwapValidationError("Only a pending swap can be approved.")

    with transaction.atomic():
        # Re-fetch the request under a row lock BEFORE any mutation to prevent
        # concurrent double-approval (two approvers / double-click both passing
        # the pre-flight check above and then both entering the transaction).
        locked_request = (
            ShiftSwapRequest.all_objects.select_for_update()
            .filter(id=swap_request.id)
            .first()
        )
        if locked_request is None or locked_request.status != "pending":
            raise SwapValidationError("Only a pending swap can be approved.")

        rows = {
            r.id: r
            for r in ShiftAssignment.all_objects.select_for_update()
            .filter(
                id__in=(
                    swap_request.requester_assignment_id,
                    swap_request.counterparty_assignment_id,
                )
            )
            .select_related("shift", "employee")
        }
        a1 = rows[swap_request.requester_assignment_id]
        a2 = rows[swap_request.counterparty_assignment_id]

        # The roster can change between submit and approve — re-check.
        validate_pair(
            requester_assignment=a1,
            counterparty_assignment=a2,
            requester=a1.employee,
            exclude_request_id=swap_request.id,
        )

        cleared = a1.covering_for_id is not None or a2.covering_for_id is not None

        # Exchange the (work_date, shift_id) pair. Employee stays put, so no
        # ordering constraint and no transient unique violation in any shape.
        a1.work_date, a2.work_date = a2.work_date, a1.work_date
        a1.shift_id, a2.shift_id = a2.shift_id, a1.shift_id
        a1.covering_for_id = None
        a2.covering_for_id = None
        a1.save(update_fields=["work_date", "shift", "covering_for", "updated_at"])
        a2.save(update_fields=["work_date", "shift", "covering_for", "updated_at"])

        parts = [note] if note else []
        if cleared:
            parts.append("covering_for cleared on both rows by the swap.")
        locked_request.status = "approved"
        locked_request.decided_by = actor_id
        locked_request.decided_at = timezone.now()
        locked_request.decision_note = " ".join(parts)
        locked_request.save(
            update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"]
        )

        # Reflect the changes onto the caller's in-memory object so the caller
        # sees the updated state without needing a separate refresh_from_db().
        swap_request.status = locked_request.status
        swap_request.decided_by = locked_request.decided_by
        swap_request.decided_at = locked_request.decided_at
        swap_request.decision_note = locked_request.decision_note

    return swap_request
