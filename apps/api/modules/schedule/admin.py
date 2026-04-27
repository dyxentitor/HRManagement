from django.contrib import admin

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule


@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ("employee", "name", "effective_from", "effective_to")
    list_filter = ("effective_from",)
    search_fields = ("employee__employee_code", "employee__email")


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "org_id", "start_time", "end_time", "crosses_midnight")
    list_filter = ("crosses_midnight",)


@admin.register(ShiftAssignment)
class ShiftAssignmentAdmin(admin.ModelAdmin):
    list_display = ("employee", "shift", "work_date", "status", "published_at")
    list_filter = ("status", "shift")
    date_hierarchy = "work_date"
    search_fields = ("employee__employee_code",)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("date", "name", "type", "org_id")
    list_filter = ("type", "applies_to_country_code")
    date_hierarchy = "date"
