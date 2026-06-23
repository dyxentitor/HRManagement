from rest_framework import serializers

from .models import Assignment, AssignmentRecipient


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
        )
        read_only_fields = ("id", "status", "created_by", "created_at")


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
            "created_at",
        )
        read_only_fields = fields
