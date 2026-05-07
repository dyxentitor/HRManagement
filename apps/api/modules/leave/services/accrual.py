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


# --- Celery beat jobs (year-rollover + daily expiry) ----------------------------

import uuid as _uuid  # noqa: E402

from dateutil.relativedelta import relativedelta  # noqa: E402
from django.db import IntegrityError, transaction  # noqa: E402

from modules.employee.models import Employee  # noqa: E402
from modules.leave.models import LeaveBalance, LeaveBalanceLedger  # noqa: E402

# Stable namespace UUID for the v1.8.0 accrual job idempotency keys.
_ACCRUAL_NS = _uuid.UUID("11111111-1111-1111-1111-111111111111")


def _ref_uuid(*parts) -> _uuid.UUID:
    return _uuid.uuid5(_ACCRUAL_NS, "/".join(str(p) for p in parts))


def run_year_start_accrual(*, org_id, year: int, dry_run: bool = False) -> dict:
    """Grant per-(employee, leave_type) entitlement at year-start.

    Idempotent on (reference_type='accrual_year_start',
    reference_id=UUID5(emp, leave_type, year)).
    """
    granted = 0
    errors: list[dict] = []

    employees = Employee.all_objects.filter(
        org_id=org_id,
        status="active",
        deleted_at__isnull=True,
    )
    leave_types = (
        LeaveType.all_objects.filter(org_id=org_id, deleted_at__isnull=True)
        .exclude(accrual_type="event_based")
        .exclude(accrual_type="none")
    )

    for emp in employees:
        for lt in leave_types:
            try:
                full = compute_entitlement(employee=emp, leave_type=lt, year=year)
                final = prorate_for_hire_date(
                    entitlement=full,
                    hire_date=emp.hire_date,
                    year=year,
                )
                if final <= 0:
                    continue
                ref_id = _ref_uuid(emp.id, lt.id, "accrual_year_start", year)
                if dry_run:
                    granted += 1
                    continue
                with transaction.atomic():
                    LeaveBalance.all_objects.update_or_create(
                        org_id=org_id,
                        employee_id=emp.id,
                        leave_type=lt,
                        year=year,
                        defaults={"entitled": final, "accrued": final},
                    )
                    LeaveBalanceLedger.objects.create(
                        org_id=org_id,
                        employee_id=emp.id,
                        leave_type=lt,
                        delta=final,
                        reason="accrual",
                        reference_type="accrual_year_start",
                        reference_id=ref_id,
                    )
                granted += 1
            except IntegrityError:
                # Already granted (idempotency hit) — counts as success
                granted += 1
            except Exception as exc:
                errors.append(
                    {
                        "employee_id": str(emp.id),
                        "leave_type": lt.code,
                        "error": str(exc),
                    }
                )

    skipped = (
        Employee.all_objects.filter(
            org_id=org_id,
            deleted_at__isnull=True,
        )
        .exclude(status="active")
        .count()
    )
    return {"granted": granted, "skipped": skipped, "errors": errors}


def run_year_end_carry_forward(*, org_id, year: int, dry_run: bool = False) -> dict:
    """Carry unused entitlement from `year` into `year+1`, capped + stamped with expiry."""
    carried_count = 0
    skipped_count = 0
    errors: list[dict] = []

    balances = LeaveBalance.all_objects.filter(
        org_id=org_id,
        year=year,
        deleted_at__isnull=True,
    ).select_related("leave_type")

    for bal in balances:
        lt = bal.leave_type
        if lt.carry_forward_max <= 0:
            skipped_count += 1
            continue
        unused = (bal.entitled + bal.carried_forward) - bal.taken
        if unused <= 0:
            skipped_count += 1
            continue
        carry = min(unused, lt.carry_forward_max)
        ref_id = _ref_uuid(bal.employee_id, lt.id, "carry_forward", year + 1)
        next_year_start = datetime.date(year + 1, 1, 1)
        expires_at = None
        if lt.carry_forward_expiry_months:
            expires_at = next_year_start + relativedelta(months=int(lt.carry_forward_expiry_months))
        if dry_run:
            carried_count += 1
            continue
        try:
            with transaction.atomic():
                LeaveBalance.all_objects.update_or_create(
                    org_id=org_id,
                    employee_id=bal.employee_id,
                    leave_type=lt,
                    year=year + 1,
                    defaults={
                        "carried_forward": carry,
                        "carried_forward_expires_at": expires_at,
                    },
                )
                LeaveBalanceLedger.objects.create(
                    org_id=org_id,
                    employee_id=bal.employee_id,
                    leave_type=lt,
                    delta=carry,
                    reason="carry_forward",
                    reference_type="carry_forward",
                    reference_id=ref_id,
                )
            carried_count += 1
        except IntegrityError:
            carried_count += 1
        except Exception as exc:
            errors.append(
                {
                    "employee_id": str(bal.employee_id),
                    "leave_type": lt.code,
                    "error": str(exc),
                }
            )
    return {"carried": carried_count, "skipped": skipped_count, "errors": errors}


def run_carry_forward_expiry(*, today=None, dry_run: bool = False) -> dict:
    """Sweep expired carry-forward balances; debit unused remainder."""
    today = today or datetime.date.today()
    debited = 0
    balances = LeaveBalance.all_objects.filter(
        carried_forward__gt=0,
        carried_forward_expires_at__lte=today,
        deleted_at__isnull=True,
    ).select_related("leave_type")

    for bal in balances:
        # FIFO model: carried days are consumed first (employee-friendly: otherwise
        # 100% of carries would always expire). Unused = carried_forward - min(taken, carried).
        # When taken >= carried_forward, the entire carry pool was used; nothing to expire.
        carry_used = min(bal.taken, bal.carried_forward)
        unused_carry = bal.carried_forward - carry_used
        if unused_carry <= 0:
            continue
        ref_id = _ref_uuid(bal.employee_id, bal.leave_type_id, "carry_forward_expired", bal.year)
        if dry_run:
            debited += 1
            continue
        try:
            with transaction.atomic():
                LeaveBalanceLedger.objects.create(
                    org_id=bal.org_id,
                    employee_id=bal.employee_id,
                    leave_type=bal.leave_type,
                    delta=-unused_carry,
                    reason="carry_forward",
                    reference_type="carry_forward_expired",
                    reference_id=ref_id,
                )
                bal.carried_forward = bal.carried_forward - unused_carry
                bal.save(update_fields=["carried_forward", "updated_at"])
            debited += 1
        except IntegrityError:
            pass  # already expired today -- no-op
    return {"debited": debited}
