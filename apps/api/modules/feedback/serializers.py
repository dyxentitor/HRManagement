"""Serializers for the feedback module.

Split:
  - FeedbackSerializer       reporter-safe (no notes / assignee / reporter_email)
  - FeedbackAdminSerializer  adds reporter_email, assignee_id, assignee_name, notes
"""

from typing import ClassVar

from rest_framework import serializers

from .models import (
    STATUS_CHOICES,
    Feedback,
    FeedbackAttachment,
    FeedbackNote,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_name(user) -> str:
    """Return Employee full_name for *user* if an Employee row exists, else user.email."""
    if user is None:
        return ""
    emp = getattr(user, "employee_profile", None)
    if emp is None:
        # employee_profile is a OneToOne reverse; fall back to queryset lookup
        # (handles soft-deleted employees where the accessor may be absent).
        from modules.employee.models import Employee

        emp = Employee.all_objects.filter(user_id=user.id).first()
    if emp is not None:
        return emp.full_name
    return user.email


# ---------------------------------------------------------------------------
# Nested serializers
# ---------------------------------------------------------------------------


class FeedbackAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedbackAttachment
        fields: ClassVar[tuple[str, ...]] = (
            "id",
            "filename",
            "content_type",
            "size_bytes",
            "s3_key",
            "uploaded_at",
        )
        read_only_fields: ClassVar[tuple[str, ...]] = (
            "id",
            "uploaded_at",
        )


class FeedbackNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = FeedbackNote
        fields: ClassVar[tuple[str, ...]] = (
            "id",
            "author_id",
            "author_name",
            "body",
            "created_at",
        )
        read_only_fields: ClassVar[tuple[str, ...]] = (
            "id",
            "created_at",
        )

    def get_author_name(self, obj) -> str:
        from modules.identity.models import User

        user = User.objects.filter(id=obj.author_id).first()
        return _resolve_name(user)


# ---------------------------------------------------------------------------
# Reporter-safe serializer (no notes / assignee / reporter_email)
# ---------------------------------------------------------------------------


class FeedbackSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    attachments = FeedbackAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Feedback
        fields: ClassVar[tuple[str, ...]] = (
            "id",
            "category",
            "title",
            "description",
            "affected_module",
            "status",
            "created_at",
            "updated_at",
            "reporter_name",
            "attachments",
        )
        read_only_fields: ClassVar[tuple[str, ...]] = (
            "id",
            "created_at",
            "updated_at",
            "reporter_name",
            "attachments",
        )

    def get_reporter_name(self, obj) -> str:
        return _resolve_name(obj.reporter)


# ---------------------------------------------------------------------------
# Admin serializer — subclasses FeedbackSerializer, adds internal fields
# ---------------------------------------------------------------------------


class FeedbackAdminSerializer(FeedbackSerializer):
    reporter_email = serializers.SerializerMethodField()
    assignee_id = serializers.UUIDField(source="assignee.id", read_only=True, allow_null=True)
    assignee_name = serializers.SerializerMethodField()
    notes = FeedbackNoteSerializer(many=True, read_only=True)

    class Meta(FeedbackSerializer.Meta):
        fields: ClassVar[tuple[str, ...]] = (
            *FeedbackSerializer.Meta.fields,
            "reporter_email",
            "assignee_id",
            "assignee_name",
            "notes",
        )
        read_only_fields: ClassVar[tuple[str, ...]] = (
            *FeedbackSerializer.Meta.read_only_fields,
            "reporter_email",
            "assignee_id",
            "assignee_name",
            "notes",
        )

    def get_reporter_email(self, obj) -> str | None:
        reporter = obj.reporter
        return reporter.email if reporter is not None else None

    def get_assignee_name(self, obj) -> str | None:
        if obj.assignee is None:
            return None
        return _resolve_name(obj.assignee)


# ---------------------------------------------------------------------------
# Write serializers
# ---------------------------------------------------------------------------


class FeedbackCreateSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=[c[0] for c in Feedback.category.field.choices])
    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    affected_module = serializers.CharField(max_length=64, required=False, default="")


class FeedbackUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[c[0] for c in STATUS_CHOICES],
        required=False,
    )
    assignee_id = serializers.UUIDField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Attachment upload helpers
# ---------------------------------------------------------------------------


class PresignedUploadSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)


class RegisterAttachmentSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    size_bytes = serializers.IntegerField(min_value=1)
    s3_key = serializers.CharField(max_length=500)


class FeedbackNoteWriteSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1)
