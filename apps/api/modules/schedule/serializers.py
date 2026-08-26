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
    is_protected = serializers.BooleanField(read_only=True)
    published = serializers.BooleanField(read_only=True)

    class Meta:
        model = Holiday
        fields = (
            "id",
            "date",
            "name",
            "type",
            "applies_to_country_code",
            "applies_to_state_code",
            "applies_to_subdivision_code",
            # Provenance — read-only. Written by the import pipeline, surfaced
            # so the admin UI can show where a row came from and whether it is
            # safe to overwrite.
            "source",
            "source_provider",
            "source_version",
            "imported_at",
            "observed",
            "provisional",
            "published",
            "confirmed_at",
            "confirmed_by",
            "is_protected",
            "external_id",
            "occurrence",
            # Tenant-editable.
            "excluded",
            "notes",
        )
        read_only_fields = (
            "id",
            "source",
            "source_provider",
            "source_version",
            "imported_at",
            "observed",
            "provisional",
            "published",
            "confirmed_at",
            "confirmed_by",
            "is_protected",
            "external_id",
            "occurrence",
        )


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
    # Times let the swap drawer's review step compare both sides (and the
    # request list show a time range) without a second round-trip.
    shift_start = serializers.TimeField(source="shift.start_time", read_only=True)
    shift_end = serializers.TimeField(source="shift.end_time", read_only=True)
    shift_crosses_midnight = serializers.BooleanField(
        source="shift.crosses_midnight", read_only=True
    )

    class Meta:
        model = ShiftAssignment
        fields = (
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "shift",
            "shift_name",
            "shift_code",
            "shift_start",
            "shift_end",
            "shift_crosses_midnight",
            "work_date",
        )


class SwapCandidateSerializer(ShiftSwapAssignmentBriefSerializer):
    """A teammate's shift as shown in the swap picker.

    Only the fields a candidate card renders — never a whole roster row, and
    never anything from outside the requester's org (the queryset is org-scoped
    before this serializer ever sees a row).
    """

    department_name = serializers.CharField(source="employee.department.name", read_only=True)
    team_name = serializers.CharField(source="employee.team.name", default=None, read_only=True)
    compatible = serializers.SerializerMethodField()
    incompatible_reason = serializers.SerializerMethodField()
    warnings = serializers.SerializerMethodField()

    class Meta(ShiftSwapAssignmentBriefSerializer.Meta):
        fields = (
            *ShiftSwapAssignmentBriefSerializer.Meta.fields,
            "department_name",
            "team_name",
            "compatible",
            "incompatible_reason",
            "warnings",
        )

    def get_compatible(self, obj) -> bool:
        return self.context.get("reasons", {}).get(obj.id) is None

    def get_incompatible_reason(self, obj) -> str | None:
        return self.context.get("reasons", {}).get(obj.id)

    def get_warnings(self, obj) -> list:
        return self.context.get("warnings", {}).get(obj.id, [])


class ShiftSwapRequestSerializer(serializers.ModelSerializer):
    requester_assignment = ShiftSwapAssignmentBriefSerializer(read_only=True)
    counterparty_assignment = ShiftSwapAssignmentBriefSerializer(read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    counterparty_name = serializers.CharField(source="counterparty.full_name", read_only=True)

    class Meta:
        model = ShiftSwapRequest
        fields = (
            "id",
            "requester_assignment",
            "counterparty_assignment",
            "requester",
            "requester_name",
            "counterparty",
            "counterparty_name",
            "reason",
            "status",
            "decided_by",
            "decided_at",
            "decision_note",
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
