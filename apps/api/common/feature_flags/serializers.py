from rest_framework import serializers


class FeatureFlagSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    enabled = serializers.BooleanField()
    togglable = serializers.BooleanField()
    critical = serializers.BooleanField()
    derived = serializers.BooleanField()
    depends_on = serializers.ListField(child=serializers.CharField(), required=False)
    depends_on_any = serializers.ListField(child=serializers.CharField(), required=False)


class FeatureFlagInputSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
