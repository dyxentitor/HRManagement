"""Seed a new employee's current-year leave balances at creation (opt-in).

Called by the unified employee-creation endpoint (Task 1 → Task 6) when the
caller supplies ``initial_leave_items``.  Each item requests a prorated
``LeaveBalance`` for the current year (§60E by-month) and, when flagged
``permanent``, a matching ``EmployeeLeaveOverride`` that will govern future
year-start accruals.

Idempotency: the ledger row for each (employee, leave_type) pair is keyed by a
deterministic UUID5 so replaying the call is a no-op.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from modules.leave.models import EmployeeLeaveOverride, LeaveBalance, LeaveType
from modules.leave.services.accrual import prorate_for_hire_date
from modules.leave.services.ledger import LeaveLedgerService

# Only accrual-based leave types can have an initial balance pre-granted.
ELIGIBLE_ACCRUAL_TYPES = ("annual", "monthly")

# Deterministic UUID5 namespace for employee-creation ledger entries so that
# re-running the grant for the same (employee, leave_type) is idempotent.
_CREATION_NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid.NAMESPACE_URL


def _creation_reference_id(employee_id: uuid.UUID, leave_type_id: uuid.UUID) -> uuid.UUID:
    """Return a deterministic UUID for the ledger idempotency key."""
    return uuid.uuid5(_CREATION_NS, f"employee_creation:{employee_id}:{leave_type_id}")


def grant_initial_leave(
    *,
    employee,
    items: list[dict],
    actor_id,
    year: int | None = None,
) -> list[LeaveBalance]:
    """Seed leave balances for a newly created employee.

    Parameters
    ----------
    employee:
        Employee model instance.  Must have ``org_id``, ``id``, and
        ``hire_date`` attributes.
    items:
        List of dicts, each with keys:
        - ``leave_type_id`` (UUID)
        - ``days_per_year`` (Decimal or coercible)
        - ``permanent`` (bool) — if True, create an EmployeeLeaveOverride
    actor_id:
        UUID of the user performing the action (written to ledger + override).
        May be None when called from a system/automated context.
    year:
        Calendar year to seed.  Defaults to the current local year.

    Returns
    -------
    list[LeaveBalance]
        One LeaveBalance per item, in order.

    Raises
    ------
    rest_framework.exceptions.ValidationError
        If a leave_type_id is unknown, belongs to a different org, has a
        non-accrual accrual_type, or days_per_year is negative.
    """
    year = year or timezone.localdate().year
    created: list[LeaveBalance] = []

    for item in items:
        days = Decimal(str(item["days_per_year"]))
        if days < 0:
            raise ValidationError({"days_per_year": "Must be >= 0."})

        lt = LeaveType.all_objects.filter(
            org_id=employee.org_id,
            id=item["leave_type_id"],
            deleted_at__isnull=True,
        ).first()
        if lt is None:
            raise ValidationError(
                {"leave_type_id": f"Unknown leave type {item['leave_type_id']}."}
            )
        if lt.accrual_type not in ELIGIBLE_ACCRUAL_TYPES:
            raise ValidationError(
                {
                    "leave_type_id": (
                        f"{lt.code} has accrual_type='{lt.accrual_type}' and cannot be "
                        "pre-granted at account creation. Only 'annual' and 'monthly' types "
                        "are eligible."
                    )
                }
            )

        # --- Optional permanent override (governs future year-start accruals) ---
        if item.get("permanent"):
            existing = EmployeeLeaveOverride.all_objects.filter(
                org_id=employee.org_id,
                employee_id=employee.id,
                leave_type=lt,
                effective_from=datetime.date(year, 1, 1),
                deleted_at__isnull=True,
            ).first()
            if existing is None:
                EmployeeLeaveOverride.all_objects.create(
                    org_id=employee.org_id,
                    employee_id=employee.id,
                    leave_type=lt,
                    effective_from=datetime.date(year, 1, 1),
                    days_override=days,
                    effective_to=None,
                    created_by=actor_id,
                    note="Set at account creation",
                )

        # --- Prorated balance for current year (§60E by-month) ---
        prorated = prorate_for_hire_date(entitlement=days, hire_date=employee.hire_date, year=year)
        bal, _ = LeaveBalance.all_objects.update_or_create(
            org_id=employee.org_id,
            employee_id=employee.id,
            leave_type=lt,
            year=year,
            defaults={"entitled": prorated, "accrued": prorated},
        )

        # --- Append-only ledger row (idempotent via deterministic UUID5 key) ---
        LeaveLedgerService.append(
            org_id=employee.org_id,
            employee_id=employee.id,
            leave_type=lt,
            delta=prorated,
            reason="accrual",
            reference_type="employee_creation",
            reference_id=_creation_reference_id(employee.id, lt.id),
            actor_id=actor_id,
        )

        created.append(bal)

    return created
