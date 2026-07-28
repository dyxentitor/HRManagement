from __future__ import annotations

from rest_framework import serializers

from .emails import PLACEHOLDERS
from .models import EmailConfiguration, EmailTemplate

_READ_FIELDS = (
    "enabled",
    "smtp_host",
    "smtp_port",
    "encryption",
    "use_auth",
    "smtp_username",
    "has_password",
    "sender_name",
    "sender_email",
    "reply_to",
    "connection_timeout",
    "rate_limit_per_minute",
    "max_retry_attempts",
    "retry_interval_seconds",
    "signature",
    "accent_color",
    "header_html",
    "footer_html",
    "provider_preset",
    "last_test_at",
    "last_success_at",
    "last_failure_at",
    "last_failure_message",
    "updated_at",
)

_WRITE_FIELDS = (
    "enabled",
    "smtp_host",
    "smtp_port",
    "encryption",
    "use_auth",
    "smtp_username",
    "smtp_password",
    "sender_name",
    "sender_email",
    "reply_to",
    "connection_timeout",
    "rate_limit_per_minute",
    "max_retry_attempts",
    "retry_interval_seconds",
    "signature",
    "accent_color",
    "header_html",
    "footer_html",
    "provider_preset",
)

# Human-readable labels for each known template key.
_KEY_LABELS: dict[str, str] = {
    "digest": "Notification Digest",
    "notification": "Single Notification",
    "security": "Security Alert",
    "password_reset": "Password Reset",
    "bank_changed": "Bank Info Changed",
    "invite": "Account Invitation",
}


class EmailConfigurationSerializer(serializers.ModelSerializer):
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = EmailConfiguration
        fields = _READ_FIELDS

    def get_has_password(self, obj: EmailConfiguration) -> bool:
        return bool(obj.smtp_password)


class EmailConfigWriteSerializer(serializers.ModelSerializer):
    smtp_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=255
    )
    smtp_port = serializers.IntegerField(required=False, min_value=1, max_value=65535)
    connection_timeout = serializers.IntegerField(required=False, min_value=1, max_value=300)
    rate_limit_per_minute = serializers.IntegerField(required=False, min_value=1, max_value=1000)
    max_retry_attempts = serializers.IntegerField(required=False, min_value=0, max_value=10)
    retry_interval_seconds = serializers.IntegerField(required=False, min_value=1, max_value=3600)
    signature = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    class Meta:
        model = EmailConfiguration
        fields = _WRITE_FIELDS

    def validate(self, attrs):
        def cur(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None)

        # Cross-field requirements only bite when the config is being enabled;
        # while disabled it may be edited progressively as an incomplete draft.
        if cur("enabled"):
            if not (cur("smtp_host") or "").strip():
                raise serializers.ValidationError({"smtp_host": "Required when email is enabled."})
            if not cur("sender_email"):
                raise serializers.ValidationError(
                    {"sender_email": "Required when email is enabled."}
                )
            if cur("use_auth"):
                if not (cur("smtp_username") or "").strip():
                    raise serializers.ValidationError(
                        {"smtp_username": "Required when authentication is on."}
                    )
                has_stored = bool(getattr(self.instance, "smtp_password", None))
                if not attrs.get("smtp_password") and not has_stored:
                    raise serializers.ValidationError(
                        {"smtp_password": "Required when authentication is on."}
                    )
        return attrs

    def update(self, instance, validated_data):
        # Blank/omitted password -> keep the stored secret (spec decision D).
        if not validated_data.get("smtp_password"):
            validated_data.pop("smtp_password", None)
        return super().update(instance, validated_data)


class TestConnectionSerializer(EmailConfigWriteSerializer):
    class Meta(EmailConfigWriteSerializer.Meta):
        fields = _WRITE_FIELDS

    def validate(self, attrs):
        # Draft config -> skip the enabled/auth cross-field gates.
        return attrs


class SendTestEmailSerializer(TestConnectionSerializer):
    recipient = serializers.EmailField(required=True)
    template_key = serializers.CharField(required=False, allow_blank=True)

    class Meta(TestConnectionSerializer.Meta):
        fields = ("recipient", "template_key", *_WRITE_FIELDS)


class TokenSpecSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField()
    sample = serializers.CharField()


class EmailTemplateListSerializer(serializers.Serializer):
    """Serializer for a single entry in the template list."""

    key = serializers.CharField()
    label = serializers.CharField()
    has_override = serializers.BooleanField()
    placeholders = TokenSpecSerializer(many=True)


class EmailTemplateSerializer(serializers.Serializer):
    """Serializer for the detail view of a template."""

    key = serializers.CharField()
    subject = serializers.CharField(allow_blank=True)
    text_body = serializers.CharField(allow_blank=True)
    html_body = serializers.CharField(allow_blank=True)
    has_override = serializers.BooleanField()
    placeholders = TokenSpecSerializer(many=True)


class EmailTemplateWriteSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating an EmailTemplate override."""

    subject = serializers.CharField(required=False, allow_blank=True, max_length=255)
    text_body = serializers.CharField(required=False, allow_blank=True)
    html_body = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = EmailTemplate
        fields = ("subject", "text_body", "html_body")


class EmailTemplatePreviewSerializer(serializers.Serializer):
    """Request body for the preview endpoint (all fields optional)."""

    subject = serializers.CharField(required=False, allow_blank=True, default="")
    text_body = serializers.CharField(required=False, allow_blank=True, default="")
    html_body = serializers.CharField(required=False, allow_blank=True, default="")


def _placeholders_for(key: str) -> list[dict]:
    return [
        {"name": t.name, "description": t.description, "sample": t.sample}
        for t in PLACEHOLDERS.get(key, [])
    ]


def _label_for(key: str) -> str:
    return _KEY_LABELS.get(key, key.replace("_", " ").title())
