"""Serializers for the KPI module."""

from __future__ import annotations

from rest_framework import serializers

from .models import KpiAssignment, KpiCycle, KpiDefinition, KpiReview, KpiTemplate


class KpiDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = KpiDefinition
        fields = (
            "id",
            "code",
            "name",
            "description",
            "metric_type",
            "target",
            "unit",
            "weight",
            "evidence_required",
            "sort_order",
        )
        read_only_fields = ("id",)


class KpiTemplateSerializer(serializers.ModelSerializer):
    definitions = KpiDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = KpiTemplate
        fields = (
            "id",
            "name",
            "description",
            "applies_to_role_id",
            "applies_to_dept_id",
            "definitions",
        )
        read_only_fields = ("id",)


class KpiTemplateWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = KpiTemplate
        fields = (
            "name",
            "description",
            "applies_to_role_id",
            "applies_to_dept_id",
        )


class KpiCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = KpiCycle
        fields = (
            "id",
            "name",
            "type",
            "starts_on",
            "ends_on",
            "review_opens_on",
            "review_closes_on",
            "status",
        )
        read_only_fields = ("id", "status")


class KpiAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = KpiAssignment
        fields = (
            "id",
            "cycle",
            "employee_id",
            "template",
            "kpis",
            "status",
        )
        read_only_fields = ("id", "kpis", "status")


class BulkAssignSerializer(serializers.Serializer):
    cycle_id = serializers.UUIDField()
    template_id = serializers.UUIDField()
    employee_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)


class SubmitSelfReviewSerializer(serializers.Serializer):
    scores = serializers.JSONField(default=dict)
    overall_comment = serializers.CharField(allow_blank=True, default="")


class SubmitManagerReviewSerializer(serializers.Serializer):
    scores = serializers.JSONField(default=dict)
    overall_comment = serializers.CharField(allow_blank=True, default="")


class KpiReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = KpiReview
        fields = (
            "id",
            "assignment",
            "stage",
            "iteration",
            "scores",
            "overall_comment",
            "evidence",
            "submitted_by",
            "submitted_at",
        )
        read_only_fields = fields


class EvidencePresignSerializer(serializers.Serializer):
    filename = serializers.CharField()
    content_type = serializers.CharField()


class TeamSummarySerializer(serializers.Serializer):
    assignment_id = serializers.UUIDField()
    employee_id = serializers.UUIDField()
    status = serializers.CharField()
    self_review_count = serializers.IntegerField()
    manager_review_count = serializers.IntegerField()
