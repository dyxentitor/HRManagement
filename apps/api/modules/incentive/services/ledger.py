"""Incentive ledger engine — the money-critical core.

Sign convention: ``MandayLedger.delta`` is **pool-perspective** — ``pool_topup`` adds (+),
``claim_payout`` drains (-), ``reclaimed`` restores (+). Therefore ``customer_remaining = Σ delta``
directly; a project's *consumed* mandays and an employee's *earnings* are the negated row sums.

Money-moving operations are atomic and lock the Customer then the Project (fixed order). Approval is
the only event that mints a payout; reject mints nothing; reverse writes a balancing ``reclaimed``
row. The ledger is append-only — corrections (incl. amendments) are new rows, never edits.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from common.audit.service import append as audit_append
from modules.organization.models import Organization

from ..models import ZERO, Claim, Customer, EmployeeBond, MandayLedger, Project

DEFAULT_RATE = Decimal("50")


# --------------------------------------------------------------------------- settings / rate / SOC
def _incentive_settings(org_id) -> dict:
    org = Organization.objects.filter(id=org_id).first()
    return (org.settings or {}).get("incentive", {}) if org else {}


def settings_rate(org_id) -> Decimal:
    raw = _incentive_settings(org_id).get("credit_value_rm", DEFAULT_RATE)
    return Decimal(str(raw))


def credits_to_rm(mandays: Decimal, org_id) -> Decimal:
    return Decimal(str(mandays)) * settings_rate(org_id)


def soc_role_codes(org_id) -> set[str]:
    return set(_incentive_settings(org_id).get("soc_role_codes", []))


def is_soc(employee) -> bool:
    """True if the employee holds any configured SOC role. Fail-open: no config => nobody is SOC."""
    codes = soc_role_codes(employee.org_id)
    if not codes:
        return False
    user = getattr(employee, "user", None)
    if user is None:
        return False
    return bool(set(user.roles.values_list("code", flat=True)) & codes)


def can_see_project(employee, project: Project) -> bool:
    """A project is visible to everyone except SOC, unless the manager opted SOC in."""
    if project.include_soc:
        return True
    return not is_soc(employee)


# ------------------------------------------------------------------ eligibility (mandays bond)
def active_bond(employee_id, org_id, on: dt.date | None = None) -> EmployeeBond | None:
    bond = EmployeeBond.objects.filter(org_id=org_id, employee_id=employee_id).first()
    return bond if (bond and bond.is_active(on)) else None


def eligible(employee_id, org_id, on: dt.date | None = None) -> bool:
    return active_bond(employee_id, org_id, on) is not None


# --------------------------------------------------------------------------- derivations
def customer_remaining(customer_id) -> Decimal:
    agg = MandayLedger.objects.filter(customer_id=customer_id).aggregate(s=Sum("delta"))
    return agg["s"] or ZERO


def project_consumed(project_id) -> Decimal:
    agg = MandayLedger.objects.filter(project_id=project_id).aggregate(s=Sum("delta"))
    return -(agg["s"] or ZERO)


def earnings_for(employee_id, org_id) -> Decimal:
    """Mandays earned by an employee = -(Σ delta of payout/reclaim rows to them)."""
    agg = MandayLedger.objects.filter(org_id=org_id, to_employee_id=employee_id).aggregate(
        s=Sum("delta")
    )
    return -(agg["s"] or ZERO)


def quarter_of(d: dt.date) -> str:
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


# --------------------------------------------------------------------------- ledger writes
@transaction.atomic
def top_up(customer: Customer, mandays, *, actor_id, note: str = "") -> MandayLedger:
    """Load (or add to) a customer's manday pool."""
    amount = Decimal(str(mandays))
    if amount <= ZERO:
        raise ValidationError("Top-up must be positive.")
    row = MandayLedger.objects.create(
        org_id=customer.org_id,
        customer=customer,
        delta=amount,
        ledger_type="pool_topup",
        note=note,
        created_by=actor_id,
    )
    audit_append(
        org_id=customer.org_id,
        action="incentive.pool_topup",
        entity="incentive.customer",
        entity_id=customer.id,
        after={"mandays": str(amount), "remaining": str(customer_remaining(customer.id))},
        actor_id=actor_id,
    )
    return row


@transaction.atomic
def approve_claim(claim: Claim, *, actor_id) -> MandayLedger:
    """Approve a pending claim and mint exactly one ``claim_payout``.

    Atomic + idempotent. Locks Customer then Project, re-checks eligibility and both ceilings
    (project budget and customer pool), then mints the payout and stamps the billing quarter.
    """
    # Lock customer then project (fixed order) to serialise concurrent approvals on the pool.
    project = Project.objects.select_for_update().get(pk=claim.project_id)
    customer = Customer.objects.select_for_update().get(pk=project.customer_id)

    claim.refresh_from_db()
    if claim.status != "pending":
        raise ValidationError("Claim is not pending (already reviewed).")

    if not eligible(claim.employee_id, claim.org_id):
        raise ValidationError("Claimant is not eligible (no active mandays bond).")

    amount = claim.mandays
    if amount <= ZERO:
        raise ValidationError("Claim mandays must be positive.")
    if project_consumed(project.id) + amount > project.budget_mandays:
        raise ValidationError("Claim exceeds the project's remaining budget.")
    if amount > customer_remaining(customer.id):
        raise ValidationError("Claim exceeds the customer's remaining pool.")

    today = timezone.localdate()
    row = MandayLedger.objects.create(
        org_id=claim.org_id,
        customer=customer,
        project=project,
        claim=claim,
        to_employee_id=claim.employee_id,
        delta=-amount,  # pool-perspective: payout drains the pool
        ledger_type="claim_payout",
        created_by=actor_id,
    )
    claim.status = "approved"
    claim.reviewed_by = actor_id
    claim.reviewed_at = timezone.now()
    claim.billing_quarter = quarter_of(today)
    claim.payout_status = "pending"
    claim.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "billing_quarter",
            "payout_status",
            "updated_at",
        ]
    )
    audit_append(
        org_id=claim.org_id,
        action="incentive.claim_approved",
        entity="incentive.claim",
        entity_id=claim.id,
        after={"mandays": str(amount), "billing_quarter": claim.billing_quarter},
        actor_id=actor_id,
    )
    return row


@transaction.atomic
def reject_claim(claim: Claim, *, actor_id, reason: str = "") -> Claim:
    """Reject a pending claim. Mints no ledger row (nothing was ever booked)."""
    claim.refresh_from_db()
    if claim.status != "pending":
        raise ValidationError("Only a pending claim can be rejected.")
    claim.status = "rejected"
    claim.reviewed_by = actor_id
    claim.reviewed_at = timezone.now()
    claim.reject_reason = reason
    claim.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "reject_reason", "updated_at"]
    )
    audit_append(
        org_id=claim.org_id,
        action="incentive.claim_rejected",
        entity="incentive.claim",
        entity_id=claim.id,
        after={"reason": reason},
        actor_id=actor_id,
    )
    return claim


@transaction.atomic
def reverse_claim(claim: Claim, *, actor_id, reason: str = "") -> MandayLedger:
    """Cancel an already-approved claim: append a balancing ``reclaimed`` row (never delete)."""
    project = Project.objects.select_for_update().get(pk=claim.project_id)
    customer = Customer.objects.select_for_update().get(pk=project.customer_id)
    claim.refresh_from_db()
    if claim.status != "approved":
        raise ValidationError("Only an approved claim can be reversed.")

    payout = (
        MandayLedger.objects.filter(claim=claim, ledger_type="claim_payout").order_by("seq").last()
    )
    if payout is None:
        raise ValidationError("No payout row found for this claim.")

    row = MandayLedger.objects.create(
        org_id=claim.org_id,
        customer=customer,
        project=project,
        claim=claim,
        to_employee_id=claim.employee_id,
        delta=-payout.delta,  # reverses the payout (restores the pool)
        ledger_type="reclaimed",
        source_seq=payout.seq,
        note=reason,
        created_by=actor_id,
    )
    claim.status = "cancelled"
    claim.payout_status = ""
    claim.save(update_fields=["status", "payout_status", "updated_at"])
    audit_append(
        org_id=claim.org_id,
        action="incentive.claim_reversed",
        entity="incentive.claim",
        entity_id=claim.id,
        after={"reclaimed": str(-payout.delta), "reason": reason},
        actor_id=actor_id,
    )
    return row
