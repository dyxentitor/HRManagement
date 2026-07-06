"""Serializers for the announcements module."""

from __future__ import annotations

from rest_framework import serializers

from .models import Announcement, AnnouncementRead


class AnnouncementSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "category",
            "priority",
            "status",
            "pinned",
            "published_at",
            "scheduled_at",
            "expires_at",
            "audience_type",
            "audience_spec",
            "created_by",
            "created_at",
            "is_read",
            "attachments",
        )
        read_only_fields = (
            "id",
            "status",
            "published_at",
            "created_by",
            "created_at",
            "is_read",
            "attachments",
        )

    def get_is_read(self, obj) -> bool:
        read_ids = self.context.get("read_ids")
        if read_ids is not None:
            return obj.id in read_ids
        request = self.context.get("request")
        uid = getattr(getattr(request, "user", None), "id", None)
        if uid is None:
            return False
        return AnnouncementRead.objects.filter(announcement=obj, user_id=uid).exists()

    def get_attachments(self, obj) -> list:
        return [
            {
                "id": a.id,
                "filename": a.filename,
                "content_type": a.content_type,
                "size_bytes": a.size_bytes,
            }
            for a in obj.attachments.all()
        ]


class AnnouncementWriteSerializer(serializers.ModelSerializer):
    publish_now = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "category",
            "priority",
            "pinned",
            "expires_at",
            "scheduled_at",
            "audience_type",
            "audience_spec",
            "publish_now",
        )
        read_only_fields = ("id",)
