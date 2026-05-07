"""Accrual engine: entitlement resolution + §60E proration + Celery jobs.

Order of resolution (compute_entitlement):
    1. Active EmployeeLeaveOverride at year-start
    2. PolicyService.compute_entitled_days(applicable policy, hire_date, year-start)
    3. LeaveType.default_days

prorate_for_hire_date applies §60E by-month proration to a resolved entitlement
when the employee was hired in the year being computed. Rounds to nearest 0.5
(banker's rounding for tied .25 / .75 halves).
"""

from __future__ import annotations

import datetime
from decimal import ROUND_HALF_EVEN, Decimal

from django.db.models import Q

from modules.leave.models import EmployeeLeaveOverride, LeavePolicy, LeaveType
from modules.leave.services.policy import PolicyService


def _find_applicable_policy_org_scoped(
    *,
    org_id,
    leave_type: LeaveType,
    as_of: datetime.date,
    role_id=None,
    department_id=None,
) -> LeavePolicy | None:
    """Org-scoped variant of PolicyService.find_applicable_policy.

    The existing service uses the tenant-scoped manager which requires a
    thread-local org_id; this variant is callable from background jobs that
    iterate orgs and pass org_id explicitly.

    Specificity: role-specific > department-specific > org-wide.
    """
    active = LeavePolicy.all_objects.filter(
        org_id=org_id,
        leave_type=leave_type,
        deleted_at__isnull=True,
        effective_from__lte=as_of,
    ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=as_of))

    if role_id is not None:
        specific = active.filter(applies_to_role_id=role_id).first()
        if specific:
            return specific
    if department_id is not None:
        specific = active.filter(applies_to_department_id=department_id).first()
        if specific:
            return specific
    return active.filter(
        applies_to_role_id__isnull=True,
        applies_to_department_id__isnull=True,
    ).first()


def compute_entitlement(
    *,
    employee,
    leave_type: LeaveType,
    year: int,
) -> Decimal:
    """Resolve full-year entitlement (pre-proration).

    Returns Decimal — the year's full entitlement before any hire-date proration.
    Caller (year-start job) is responsible for calling `prorate_for_hire_date` after.
    """
    year_start = datetime.date(year, 1, 1)

    # 1) Active override: effective_from <= year_start AND (effective_to null OR >= year_start)
    override = (
        EmployeeLeaveOverride.all_objects.filter(
            org_id=employee.org_id,
            employee_id=employee.id,
            leave_type=leave_type,
            deleted_at__isnull=True,
            effective_from__lte=year_start,
        )
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=year_start))
        .order_by("-effective_from")
        .first()
    )
    if override is not None:
        return Decimal(str(override.days_override))

    # 2) Policy with tenure brackets (role > department > org-wide specificity)
    role_id = getattr(employee, "primary_role_id", None)
    department_id = getattr(employee.department, "id", None) if employee.department else None
    policy = _find_applicable_policy_org_scoped(
        org_id=employee.org_id,
        leave_type=leave_type,
        as_of=year_start,
        role_id=role_id,
        department_id=department_id,
    )
    if policy is not None:
        return PolicyService.compute_entitled_days(
            policy=policy,
            hire_date=employee.hire_date,
            as_of=year_start,
        )

    # 3) Fallback
    return Decimal(str(leave_type.default_days))


def prorate_for_hire_date(
    *,
    entitlement: Decimal,
    hire_date: datetime.date,
    year: int,
) -> Decimal:
    """§60E by-month proration. Hired in `year` -> entitlement * months_remaining / 12.

    Hired before `year` → no proration (return entitlement).
    Hired after `year`  → return 0.
    Result rounds to nearest 0.5.
    """
    if hire_date.year < year:
        return Decimal(str(entitlement))
    if hire_date.year > year:
        return Decimal("0")
    # Jul (7) → 6, Dec (12) → 1, Jan (1) → 12
    months_remaining = Decimal(13 - hire_date.month)
    raw = Decimal(str(entitlement)) * months_remaining / Decimal("12")
    # Round to nearest 0.5: multiply by 2, round to int (banker's), divide by 2
    return (raw * Decimal("2")).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN) / Decimal("2")
