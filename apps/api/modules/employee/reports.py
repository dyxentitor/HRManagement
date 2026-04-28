"""Employee module reports — headcount + HR-ops."""

from __future__ import annotations

import datetime
from typing import ClassVar

from common.reporting.registry import Report, register

from .models import Employee


@register
class HeadcountSnapshot(Report):
    code = "headcount.snapshot"
    title = "Headcount snapshot"
    permissions: ClassVar[list] = ["employee:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_code", "label": "Employee code"},
        {"field": "first_name", "label": "First name"},
        {"field": "last_name", "label": "Last name"},
        {"field": "department__name", "label": "Department"},
        {"field": "employment_type", "label": "Type"},
        {"field": "status", "label": "Status"},
        {"field": "joined_date", "label": "Joined"},
    ]
    filters: ClassVar[list] = [
        {"field": "department_id", "type": "text", "label": "Department ID"},
        {"field": "employment_type", "type": "select", "label": "Employment type"},
        {"field": "status", "type": "select", "label": "Status"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        qs = Employee.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
        ).select_related("department")
        if filters.get("department_id"):
            qs = qs.filter(department_id=filters["department_id"])
        if filters.get("employment_type"):
            qs = qs.filter(employment_type=filters["employment_type"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        return qs.order_by("department__name", "last_name", "first_name")


@register
class HrOpsProbationEnding(Report):
    code = "hrops.probation_ending"
    title = "Probation ending"
    permissions: ClassVar[list] = ["employee:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_code", "label": "Employee code"},
        {"field": "first_name", "label": "First name"},
        {"field": "last_name", "label": "Last name"},
        {"field": "department__name", "label": "Department"},
        {"field": "probation_end_date", "label": "Probation end"},
    ]
    filters: ClassVar[list] = [
        {"field": "within_days", "type": "number", "label": "Within days"},
    ]
    exporters: ClassVar[list] = ["csv"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        today = datetime.date.today()
        within_days = int(filters.get("within_days") or 30)
        cutoff = today + datetime.timedelta(days=within_days)
        return (
            Employee.all_objects.filter(
                org_id=user.org_id,
                deleted_at__isnull=True,
                probation_end_date__gte=today,
                probation_end_date__lte=cutoff,
            )
            .select_related("department")
            .order_by("probation_end_date")
        )


@register
class HrOpsContractEnding(Report):
    code = "hrops.contract_ending"
    title = "Contract ending"
    permissions: ClassVar[list] = ["employee:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_code", "label": "Employee code"},
        {"field": "first_name", "label": "First name"},
        {"field": "last_name", "label": "Last name"},
        {"field": "department__name", "label": "Department"},
        {"field": "employment_type", "label": "Type"},
        {"field": "contract_end_date", "label": "Contract end"},
    ]
    filters: ClassVar[list] = [
        {"field": "within_days", "type": "number", "label": "Within days"},
    ]
    exporters: ClassVar[list] = ["csv"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        today = datetime.date.today()
        within_days = int(filters.get("within_days") or 30)
        cutoff = today + datetime.timedelta(days=within_days)
        return (
            Employee.all_objects.filter(
                org_id=user.org_id,
                deleted_at__isnull=True,
                contract_end_date__gte=today,
                contract_end_date__lte=cutoff,
            )
            .select_related("department")
            .order_by("contract_end_date")
        )


@register
class HrOpsBirthdaysThisMonth(Report):
    code = "hrops.birthdays_this_month"
    title = "Birthdays this month"
    permissions: ClassVar[list] = ["employee:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_code", "label": "Employee code"},
        {"field": "first_name", "label": "First name"},
        {"field": "last_name", "label": "Last name"},
        {"field": "department__name", "label": "Department"},
        {"field": "date_of_birth", "label": "Date of birth"},
    ]
    filters: ClassVar[list] = []
    exporters: ClassVar[list] = ["csv"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        today = datetime.date.today()
        return (
            Employee.all_objects.filter(
                org_id=user.org_id,
                deleted_at__isnull=True,
                status="active",
                date_of_birth__month=today.month,
            )
            .select_related("department")
            .order_by("date_of_birth__day", "last_name")
        )
