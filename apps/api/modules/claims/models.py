"""Claim models — categories, policies, requests, attachments, approvals."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

REQUEST_STATUSES: ClassVar[list] = [
    ("draft", "Draft"),
    ("submitted", "Submitted"),
    ("manager_approved", "Manager approved"),
    ("finance_approved", "Finance approved"),
    ("reimbursed", "Reimbursed"),
    ("rejected", "Rejected"),
    ("cancelled", "Cancelled"),
]
APPROVAL_STATUSES: ClassVar[list] = [
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("delegated", "Delegated"),
    ("skipped", "Skipped"),
]


class ClaimCategory(TenantBaseModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=100)
    requires_attachment = models.BooleanField(default=True)
    max_amount_per_claim = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    currency_code = models.CharField(max_length=3, default="MYR")

    class Meta:
        db_table = "claim_category"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="claim_category_unique_code_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class ClaimPolicy(TenantBaseModel):
    category = models.ForeignKey(ClaimCategory, on_delete=models.PROTECT, related_name="policies")
    role_id = models.UUIDField(null=True, blank=True)
    dept_id = models.UUIDField(null=True, blank=True)
    annual_limit = models.DecimalField(max_digits=12, decimal_places=2)
    monthly_limit = models.DecimalField(max_digits=12, decimal_places=2)
    approval_chain_code = models.CharField(max_length=32, blank=True)

    class Meta:
        db_table = "claim_policy"
        indexes: ClassVar[list] = [
            models.Index(fields=["category"]),
        ]

    def __str__(self) -> str:
        return f"Policy({self.category.code}, ann={self.annual_limit})"


class ClaimRequest(TenantBaseModel):
    employee = models.ForeignKey(
        "employee.Employee",
        on_delete=models.PROTECT,
        related_name="claim_requests",
    )
    category = models.ForeignKey(ClaimCategory, on_delete=models.PROTECT, related_name="requests")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency_code = models.CharField(max_length=3, default="MYR")
    expense_date = models.DateField()
    description = models.TextField(blank=True)
    merchant = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=REQUEST_STATUSES, default="draft")
    current_level = models.IntegerField(default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reimbursed_at = models.DateTimeField(null=True, blank=True)
    reimbursement_reference = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "claim_request"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee", "-submitted_at"]),
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["status", "current_level"]),
        ]

    def __str__(self) -> str:
        return f"Claim({self.employee.employee_code}," f" {self.category.code}, {self.amount})"


class ClaimAttachment(models.Model):
    id = models.BigAutoField(primary_key=True)
    claim = models.ForeignKey(ClaimRequest, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    s3_key = models.CharField(max_length=500)
    uploaded_by = models.UUIDField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "claim_attachment"

    def __str__(self) -> str:
        return f"{self.filename} ({self.size_bytes} bytes)"


class ClaimApproval(models.Model):
    id = models.BigAutoField(primary_key=True)
    claim = models.ForeignKey(ClaimRequest, on_delete=models.CASCADE, related_name="approvals")
    level = models.IntegerField()
    approver_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=APPROVAL_STATUSES, default="pending")
    comment = models.TextField(blank=True)
    acted_at = models.DateTimeField(null=True, blank=True)
    delegated_to = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "claim_approval"
        indexes: ClassVar[list] = [
            models.Index(fields=["claim", "level"]),
            models.Index(fields=["approver_id", "status"]),
        ]

    def __str__(self) -> str:
        return f"approval(claim={self.claim_id}," f" level={self.level}, status={self.status})"
