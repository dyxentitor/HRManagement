"""Attendance serializers."""

from rest_framework import serializers

from .models import AttendanceRecord


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    computed_hours = serializers.FloatField(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = (
            "id",
            "org_id",
            "employee",
            "employee_code",
            "work_date",
            "clock_in",
            "clock_out",
            "computed_hours",
            "source",
            "is_holiday_work",
            "holiday_id",
            "shift_assignment_id",
            "status",
            "ip",
            "user_agent",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "org_id",
            "employee_code",
            "computed_hours",
            "is_holiday_work",
            "holiday_id",
            "status",
            "created_at",
            "updated_at",
        )


class ClockSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
