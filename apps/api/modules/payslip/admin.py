from django.contrib import admin

from .models import PayrollComponent, PayrollPeriod, PayrollRun, PayslipRecord


@admin.register(PayrollPeriod)
class PayrollPeriodAdmin(admin.ModelAdmin):
    list_display = ("period_start", "period_end", "period_type", "pay_date", "status", "org_id")
    list_filter = ("status", "period_type")


@admin.register(PayrollComponent)
class PayrollComponentAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "type", "is_statutory", "org_id")
    list_filter = ("type", "is_statutory")


@admin.register(PayslipRecord)
class PayslipRecordAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "period", "gross", "net", "status", "published_at")
    list_filter = ("status",)
    search_fields = ("employee_id",)


@admin.register(PayrollRun)
class PayrollRunAdmin(admin.ModelAdmin):
    list_display = ("period", "status", "row_count", "published_at", "uploaded_by")
    list_filter = ("status",)
