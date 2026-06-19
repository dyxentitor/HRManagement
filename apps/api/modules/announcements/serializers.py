"""Serializers for the announcements module."""

from __future__ import annotations

from rest_framework import serializers

from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "category",
            "pinned",
            "published_at",
            "expires_at",
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "created_by", "created_at")
