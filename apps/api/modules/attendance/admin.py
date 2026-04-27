from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("employee", "work_date", "clock_in", "clock_out", "status", "is_holiday_work")
    list_filter = ("status", "is_holiday_work", "source")
    date_hierarchy = "work_date"
    search_fields = ("employee__employee_code",)
