"""Notification serializers."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import serializers

from .models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields: ClassVar[list] = [
            "id",
            "type",
            "channel",
            "payload",
            "deep_link",
            "priority",
            "delivery_status",
            "read_at",
            "created_at",
        ]
        read_only_fields: ClassVar[list] = [
            "id",
            "type",
            "channel",
            "payload",
            "deep_link",
            "priority",
            "delivery_status",
            "read_at",
            "created_at",
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields: ClassVar[list] = ["id", "type", "channel", "enabled"]


class PreferenceBulkUpdateItemSerializer(serializers.Serializer):
    type = serializers.CharField(max_length=64)
    channel = serializers.ChoiceField(choices=["in_app", "email"])
    enabled = serializers.BooleanField()
