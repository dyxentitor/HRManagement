"""Serializers for the certification + training module."""

from __future__ import annotations

from rest_framework import serializers

from .models import Certification, TrainingAssignment, TrainingPlan, TrainingProgress


class CertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = (
            "id",
            "employee_id",
            "name",
            "issuer",
            "certificate_number",
            "issued_on",
            "expires_on",
            "document_s3_key",
            "status",
            "reminder_sent_30d",
            "reminder_sent_60d",
            "reminder_sent_90d",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "document_s3_key",
            "reminder_sent_30d",
            "reminder_sent_60d",
            "reminder_sent_90d",
            "created_at",
            "updated_at",
        )


class CertificationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = (
            "employee_id",
            "name",
            "issuer",
            "certificate_number",
            "issued_on",
            "expires_on",
        )


class RegisterDocumentSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500)


class PresignedUploadRequestSerializer(serializers.Serializer):
    content_type = serializers.CharField(max_length=100, default="application/pdf", required=False)


class TrainingPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingPlan
        fields = (
            "id",
            "name",
            "description",
            "required_for_role_id",
            "required_for_dept_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class TrainingProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingProgress
        fields = ("id", "assignment", "progress_pct", "notes", "ts")
        read_only_fields = ("id", "ts")


class TrainingAssignmentSerializer(serializers.ModelSerializer):
    progress = TrainingProgressSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingAssignment
        fields = (
            "id",
            "plan",
            "employee_id",
            "assigned_by",
            "due_date",
            "status",
            "completed_at",
            "evidence_s3_key",
            "progress",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "completed_at",
            "evidence_s3_key",
            "created_at",
            "updated_at",
        )


class TrainingAssignmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingAssignment
        fields = ("plan", "employee_id", "due_date")


class CompleteAssignmentSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class TrainingProgressWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingProgress
        fields = ("assignment", "progress_pct", "notes")
