"""Claims module reports."""

from __future__ import annotations

from typing import ClassVar

from common.reporting.registry import Report, register

from .models import ClaimApproval, ClaimRequest


@register
class ClaimsPendingByApprover(Report):
    code = "claims.pending_by_approver"
    title = "Claims pending by approver"
    permissions: ClassVar[list] = ["claim:read:org"]
    columns: ClassVar[list] = [
        {"field": "claim__employee__employee_code", "label": "Employee"},
        {"field": "approver_id", "label": "Approver ID"},
        {"field": "level", "label": "Level"},
        {"field": "claim__amount", "label": "Amount"},
        {"field": "claim__currency_code", "label": "Currency"},
        {"field": "claim__submitted_at", "label": "Submitted"},
    ]
    filters: ClassVar[list] = []
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        return (
            ClaimApproval.objects.filter(
                claim__org_id=user.org_id,
                status="pending",
            )
            .select_related("claim__employee")
            .order_by("approver_id", "claim__submitted_at")
        )


@register
class ClaimsSpendByCategory(Report):
    code = "claims.spend_by_category"
    title = "Claim spend by category"
    permissions: ClassVar[list] = ["claim:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "category__code", "label": "Category"},
        {"field": "amount", "label": "Amount"},
        {"field": "currency_code", "label": "Currency"},
        {"field": "expense_date", "label": "Expense date"},
        {"field": "status", "label": "Status"},
    ]
    filters: ClassVar[list] = [
        {"field": "category_code", "type": "text", "label": "Category code"},
        {"field": "date_from", "type": "date", "label": "From"},
        {"field": "date_to", "type": "date", "label": "To"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = ClaimRequest.all_objects.filter(
            org_id=user.org_id,
            status__in=("finance_approved", "reimbursed"),
            deleted_at__isnull=True,
        ).select_related("employee", "category")
        if filters.get("category_code"):
            qs = qs.filter(category__code=filters["category_code"])
        if filters.get("date_from"):
            qs = qs.filter(expense_date__gte=filters["date_from"])
        if filters.get("date_to"):
            qs = qs.filter(expense_date__lte=filters["date_to"])
        return qs.order_by("category__code", "-expense_date")


@register
class ClaimsReimbursementStatus(Report):
    code = "claims.reimbursement_status"
    title = "Claim reimbursement status"
    permissions: ClassVar[list] = ["claim:read:finance"]
    columns: ClassVar[list] = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "category__code", "label": "Category"},
        {"field": "amount", "label": "Amount"},
        {"field": "currency_code", "label": "Currency"},
        {"field": "status", "label": "Status"},
        {"field": "submitted_at", "label": "Submitted"},
        {"field": "reimbursed_at", "label": "Reimbursed"},
        {"field": "reimbursement_reference", "label": "Reference"},
    ]
    filters: ClassVar[list] = [
        {"field": "status", "type": "select", "label": "Status"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = ClaimRequest.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
        ).select_related("employee", "category")
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        return qs.order_by("-submitted_at")
