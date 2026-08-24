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


class NotificationRoutingRowSerializer(serializers.Serializer):
    """Read-only merged view of one type's routing."""

    type = serializers.CharField()
    label = serializers.CharField()
    domain = serializers.CharField()
    domain_label = serializers.CharField()
    security = serializers.BooleanField()
    sensitive_content = serializers.BooleanField()
    in_app_enabled = serializers.BooleanField()
    email_enabled = serializers.BooleanField()
    delivery = serializers.CharField()
    cc_entries = serializers.ListField(child=serializers.CharField())
    available_tokens = serializers.ListField(child=serializers.DictField())


class NotificationRoutingWriteSerializer(serializers.Serializer):
    """One row of a bulk upsert."""

    type = serializers.CharField()
    in_app_enabled = serializers.BooleanField()
    email_enabled = serializers.BooleanField()
    delivery = serializers.ChoiceField(choices=["auto", "immediate", "digest"])
    cc_entries = serializers.ListField(child=serializers.CharField(), allow_empty=True)

    def validate_type(self, value):
        from .registry import BY_TYPE

        if value not in BY_TYPE:
            raise serializers.ValidationError(f"Unknown notification type: {value}")
        return value

    def validate(self, attrs):
        from django.core.exceptions import ValidationError as DjangoValidationError

        from .registry import BY_TYPE
        from .services.routing import validate_entry

        type_code = attrs["type"]
        entries = attrs["cc_entries"]

        for entry in entries:
            try:
                validate_entry(type_code, entry)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"cc_entries": f"{entry}: {exc.messages[0]}"}
                ) from exc

        if entries and attrs["delivery"] == "digest":
            raise serializers.ValidationError(
                {
                    "delivery": (
                        "A digest bundles unrelated notifications, so it cannot carry a "
                        "CC. Use Auto or Immediate, or clear the CC list."
                    )
                }
            )

        n = BY_TYPE[type_code]
        if n.security and not attrs["email_enabled"]:
            raise serializers.ValidationError(
                {"email_enabled": "Security notifications cannot be disabled."}
            )
        return attrs
