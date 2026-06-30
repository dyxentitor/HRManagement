"""Incentive (mandays) module — customers, projects, claims, and the append-only manday ledger.

Money is tracked in *mandays* (1 manday = a configurable RM rate). Balances are NEVER stored;
they are derived by summing :class:`MandayLedger`. See the Phase-1 design spec for details.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import ClassVar

from django.db import models
from django.db.models import Sum
from django.utils import timezone

LEDGER_TYPE: ClassVar = [
    ("pool_topup", "Pool top-up"),
    ("claim_payout", "Claim payout"),
    ("reclaimed", "Reclaimed"),
]
PROJECT_STATUS: ClassVar = [("open", "Open"), ("closed", "Closed")]
CLAIM_STATUS: ClassVar = [
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("cancelled", "Cancelled"),
]
PAYOUT_STATUS: ClassVar = [
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("paid", "Paid"),
]

ZERO = Decimal("0")


class Customer(models.Model):
    """A customer holding a pool of prepaid mandays. The pool drains only as claims are approved."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=200)  # free text for now
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incentive_customer"
        indexes: ClassVar = [models.Index(fields=["org_id", "is_active"])]

    def __str__(self) -> str:
        return self.name

    @property
    def mandays_total(self) -> Decimal:
        agg = self.ledger_rows.filter(ledger_type="pool_topup").aggregate(s=Sum("delta"))
        return agg["s"] or ZERO

    @property
    def mandays_remaining(self) -> Decimal:
        """Top-ups minus approved payouts (net of reclaims) across all this customer's projects."""
        agg = self.ledger_rows.aggregate(s=Sum("delta"))
        return agg["s"] or ZERO


class Project(models.Model):
    """A manager-opened unit of work under a customer, capped at ``budget_mandays``."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="projects")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    budget_mandays = models.DecimalField(max_digits=10, decimal_places=2)
    manager_id = models.UUIDField()  # Employee id of the opener/owner
    include_soc = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=PROJECT_STATUS, default="open")
    deadline = models.DateField(null=True, blank=True)  # optional target/end date
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incentive_project"
        indexes: ClassVar = [
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def mandays_approved(self) -> Decimal:
        """Net mandays consumed by approved claims on this project (always <= budget).

        ``delta`` is pool-perspective: a ``claim_payout`` is negative (drains the pool) and a
        ``reclaimed`` is positive. So the *consumed* amount is the negated signed sum of this
        project's ledger rows.
        """
        agg = self.ledger_rows.aggregate(s=Sum("delta"))
        return -(agg["s"] or ZERO)

    @property
    def mandays_remaining(self) -> Decimal:
        return self.budget_mandays - self.mandays_approved


class Claim(models.Model):
    """An employee's contribution request against a project budget."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="claims")
    employee_id = models.UUIDField()  # the claimant
    mandays = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=CLAIM_STATUS, default="pending")
    reviewed_by = models.UUIDField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(blank=True)
    # Set at approval:
    billing_quarter = models.CharField(max_length=8, blank=True)  # "YYYY-Q#"
    payout_status = models.CharField(max_length=12, choices=PAYOUT_STATUS, blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incentive_claim"
        indexes: ClassVar = [
            models.Index(fields=["org_id", "employee_id", "status"]),
            models.Index(fields=["project", "status"]),
            models.Index(fields=["org_id", "billing_quarter", "payout_status"]),
        ]

    def __str__(self) -> str:
        return f"{self.mandays} md ({self.status})"


class MandayLedger(models.Model):
    """Immutable, append-only ledger. Never updated or deleted; corrections are new rows."""

    seq = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, null=True, blank=True, related_name="ledger_rows"
    )
    project = models.ForeignKey(
        Project, on_delete=models.PROTECT, null=True, blank=True, related_name="ledger_rows"
    )
    claim = models.ForeignKey(
        Claim, on_delete=models.PROTECT, null=True, blank=True, related_name="ledger_rows"
    )
    to_employee_id = models.UUIDField(null=True, blank=True)
    delta = models.DecimalField(max_digits=12, decimal_places=2)  # signed
    ledger_type = models.CharField(max_length=16, choices=LEDGER_TYPE)
    source_seq = models.BigIntegerField(null=True, blank=True)  # the row a reclaim reverses
    note = models.CharField(max_length=255, blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "incentive_manday_ledger"
        indexes: ClassVar = [
            models.Index(fields=["org_id", "to_employee_id"]),
            models.Index(fields=["customer", "ledger_type"]),
            models.Index(fields=["project", "ledger_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.ledger_type} {self.delta}"


class EmployeeBond(models.Model):
    """The per-employee *mandays bond* — the eligibility gate for claiming/being paid.

    Phase 1 is the accept + active-period gate only; the repayment/clawback obligation is deferred.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    employee_id = models.UUIDField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    period_start = models.DateField()
    period_end = models.DateField()
    terms_version = models.CharField(max_length=32, default="v1")
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incentive_employee_bond"
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["org_id", "employee_id"], name="uniq_bond_per_employee")
        ]

    def __str__(self) -> str:
        return f"bond {self.employee_id}"

    def is_active(self, on: dt.date | None = None) -> bool:
        on = on or timezone.localdate()
        return self.accepted_at is not None and self.period_start <= on <= self.period_end
