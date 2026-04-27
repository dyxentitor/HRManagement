from django.contrib import admin

from .models import Certification, TrainingAssignment, TrainingPlan, TrainingProgress


@admin.register(Certification)
class CertificationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "employee_id",
        "issuer",
        "issued_on",
        "expires_on",
        "status",
        "org_id",
    )
    list_filter = ("status",)
    search_fields = ("name", "certificate_number")


@admin.register(TrainingPlan)
class TrainingPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "org_id", "required_for_role_id", "required_for_dept_id")
    search_fields = ("name",)


@admin.register(TrainingAssignment)
class TrainingAssignmentAdmin(admin.ModelAdmin):
    list_display = ("plan", "employee_id", "assigned_by", "due_date", "status", "org_id")
    list_filter = ("status",)


@admin.register(TrainingProgress)
class TrainingProgressAdmin(admin.ModelAdmin):
    list_display = ("assignment", "progress_pct", "ts")
