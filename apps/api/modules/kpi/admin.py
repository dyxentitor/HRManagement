from django.contrib import admin

from .models import (
    KpiAssignment,
    KpiCycle,
    KpiDefinition,
    KpiReview,
    KpiReviewIteration,
    KpiTemplate,
)


@admin.register(KpiTemplate)
class KpiTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "org_id", "applies_to_role_id", "applies_to_dept_id")
    search_fields = ("name",)


@admin.register(KpiDefinition)
class KpiDefinitionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "template", "metric_type", "weight", "sort_order")
    search_fields = ("code", "name")


@admin.register(KpiCycle)
class KpiCycleAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "status", "starts_on", "ends_on", "org_id")
    list_filter = ("status", "type")


@admin.register(KpiAssignment)
class KpiAssignmentAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "cycle", "template", "status", "org_id")
    list_filter = ("status",)


@admin.register(KpiReview)
class KpiReviewAdmin(admin.ModelAdmin):
    list_display = ("assignment", "stage", "iteration", "submitted_by", "submitted_at")
    list_filter = ("stage",)


@admin.register(KpiReviewIteration)
class KpiReviewIterationAdmin(admin.ModelAdmin):
    list_display = ("review", "ts")
