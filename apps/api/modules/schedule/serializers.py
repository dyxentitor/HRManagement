"""Serializers for the schedule module."""

from rest_framework import serializers

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule


class WorkScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkSchedule
        fields = ("id", "employee", "name", "pattern", "effective_from", "effective_to")
        read_only_fields = ("id",)


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ("id", "name", "start_time", "end_time", "crosses_midnight", "color")
        read_only_fields = ("id",)


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    is_published = serializers.BooleanField(read_only=True)

    class Meta:
        model = ShiftAssignment
        fields = (
            "id",
            "employee",
            "employee_code",
            "shift",
            "shift_name",
            "work_date",
            "status",
            "assigned_by",
            "published_at",
            "is_published",
            "notes",
        )
        read_only_fields = (
            "id",
            "employee_code",
            "shift_name",
            "published_at",
            "is_published",
        )


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = (
            "id",
            "date",
            "name",
            "type",
            "applies_to_country_code",
            "applies_to_state_code",
        )
        read_only_fields = ("id",)


class BulkAssignSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    # Map of weekday key (mon/tue/...) -> shift UUID
    pattern = serializers.DictField(child=serializers.UUIDField())
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PublishSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()
