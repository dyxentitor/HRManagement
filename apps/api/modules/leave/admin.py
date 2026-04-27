from django.contrib import admin

from .models import LeaveBalance, LeaveBalanceLedger, LeavePolicy, LeaveType


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "org_id", "accrual_type", "is_paid", "is_statutory")
    list_filter = ("accrual_type", "is_paid", "is_statutory", "gender_restriction")
    search_fields = ("code", "name")


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = (
        "leave_type",
        "org_id",
        "days_per_year",
        "effective_from",
        "effective_to",
    )
    list_filter = ("leave_type",)


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee_id",
        "leave_type",
        "year",
        "entitled",
        "accrued",
        "taken",
        "pending",
    )
    list_filter = ("year", "leave_type")
    search_fields = ("employee_id",)


@admin.register(LeaveBalanceLedger)
class LeaveBalanceLedgerAdmin(admin.ModelAdmin):
    list_display = (
        "ts",
        "employee_id",
        "leave_type",
        "delta",
        "reason",
        "reference_type",
    )
    list_filter = ("reason", "leave_type")
    search_fields = ("employee_id",)
    readonly_fields = ("ts",)
