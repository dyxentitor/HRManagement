"""Serializers for the schedule module."""

from rest_framework import serializers

from .models import Holiday, Shift, ShiftAssignment, ShiftSwapRequest, WorkSchedule


class WorkScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkSchedule
        fields = ("id", "employee", "name", "pattern", "effective_from", "effective_to")
        read_only_fields = ("id",)


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ("id", "name", "code", "start_time", "end_time", "crosses_midnight", "color")
        read_only_fields = ("id",)


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    shift_code = serializers.CharField(source="shift.code", read_only=True)
    covering_for_name = serializers.SerializerMethodField()
    is_published = serializers.BooleanField(read_only=True)

    def get_covering_for_name(self, obj):
        if obj.covering_for_id is None:
            return None
        return obj.covering_for.full_name

    class Meta:
        model = ShiftAssignment
        fields = (
            "id",
            "employee",
            "employee_code",
            "shift",
            "shift_name",
            "shift_code",
            "covering_for",
            "covering_for_name",
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
            "shift_code",
            "covering_for_name",
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


class ShiftSwapAssignmentBriefSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    shift_code = serializers.CharField(source="shift.code", read_only=True)

    class Meta:
        model = ShiftAssignment
        fields = (
            "id", "employee", "employee_code", "employee_name",
            "shift", "shift_name", "shift_code", "work_date",
        )


class ShiftSwapRequestSerializer(serializers.ModelSerializer):
    requester_assignment = ShiftSwapAssignmentBriefSerializer(read_only=True)
    counterparty_assignment = ShiftSwapAssignmentBriefSerializer(read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    counterparty_name = serializers.CharField(source="counterparty.full_name", read_only=True)

    class Meta:
        model = ShiftSwapRequest
        fields = (
            "id", "requester_assignment", "counterparty_assignment",
            "requester", "requester_name", "counterparty", "counterparty_name",
            "reason", "status", "decided_by", "decided_at", "decision_note",
            "created_at",
        )
        read_only_fields = fields


class ShiftSwapCreateSerializer(serializers.Serializer):
    requester_assignment = serializers.UUIDField()
    counterparty_assignment = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PublishSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()


class BulkFillCellSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField()
    work_date = serializers.DateField()


class BulkFillSerializer(serializers.Serializer):
    cells = BulkFillCellSerializer(many=True)
    shift_id = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_cells(self, value):
        if not value:
            raise serializers.ValidationError("cells must not be empty")
        return value
