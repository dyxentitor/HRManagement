from rest_framework import serializers

from .models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "country_code",
            "default_currency",
            "default_timezone",
            "default_locale",
            "settings",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
