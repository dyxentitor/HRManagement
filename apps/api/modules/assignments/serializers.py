from rest_framework import serializers

from .models import Assignment, AssignmentQuestion, AssignmentRecipient


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentQuestion
        fields = ("id", "order", "text", "qtype", "options", "required")
        read_only_fields = ("id",)


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = (
            "id",
            "title",
            "description",
            "type",
            "link_url",
            "link_target",
            "default_due_date",
            "status",
            "created_by",
            "created_at",
            "complete_on",
            "requires_evidence",
            "version",
            "recurrence",
            "recurrence_interval",
            "recurrence_until",
            "is_template",
            "next_run_at",
        )
        read_only_fields = (
            "id",
            "status",
            "created_by",
            "created_at",
            "is_template",
            "next_run_at",
            "version",
        )


class RecipientSerializer(serializers.ModelSerializer):
    effective_status = serializers.CharField(read_only=True)
    assignment = AssignmentSerializer(read_only=True)

    class Meta:
        model = AssignmentRecipient
        fields = (
            "id",
            "assignment",
            "due_date",
            "status",
            "effective_status",
            "completed_at",
            "note",
            "evidence_s3_key",
            "acked_version",
            "created_at",
        )
        read_only_fields = fields
