"""Schedule viewsets + custom actions (bulk-pattern, publish, /me)."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule
from .serializers import (
    BulkAssignSerializer,
    HolidaySerializer,
    PublishSerializer,
    ShiftAssignmentSerializer,
    ShiftSerializer,
    WorkScheduleSerializer,
)
from .services.calendar import build_calendar
from .services.schedule import ScheduleService
from .services.warnings import compute_warnings


@requires_feature("schedule")
class WorkScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = WorkScheduleSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return WorkSchedule.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:work-schedule:read"]
        return ["schedule:work-schedule:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


@requires_feature("schedule")
class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return Shift.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("name")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:shift:read"]
        return ["schedule:shift:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


@requires_feature("schedule")
class ShiftAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftAssignmentSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        qs = ShiftAssignment.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).select_related("shift", "covering_for")
        emp_id = self.request.query_params.get("employee_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return qs.order_by("work_date", "employee__employee_code")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve", "calendar"):
            return ["schedule:assignment:read:team"]
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
            "bulk_pattern",
            "bulk_fill",
        ):
            return ["schedule:assignment:write:team"]
        if self.action == "publish":
            return ["schedule:assignment:publish:team"]
        if self.action == "me":
            return ["schedule:assignment:read:self"]
        return []

    def perform_create(self, serializer):
        serializer.save(
            org_id=self.request.user.org_id,
            assigned_by=self.request.user.id,
        )

    @action(detail=False, methods=["post"], url_path="bulk-pattern")
    def bulk_pattern(self, request):
        ser = BulkAssignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        n = ScheduleService.bulk_assign_pattern(
            org_id=request.user.org_id,
            employee_ids=ser.validated_data["employee_ids"],
            pattern_by_weekday=ser.validated_data["pattern"],
            date_from=ser.validated_data["date_from"],
            date_to=ser.validated_data["date_to"],
            assigned_by=request.user.id,
            notes=ser.validated_data.get("notes", ""),
        )
        return Response({"created": n}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="bulk-fill")
    def bulk_fill(self, request):
        from .serializers import BulkFillSerializer

        ser = BulkFillSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        org_id = request.user.org_id
        shift_id = ser.validated_data["shift_id"]
        cells = [
            {
                "employee_id": str(c["employee_id"]),
                "work_date": c["work_date"].isoformat(),
            }
            for c in ser.validated_data["cells"]
        ]
        notes = ser.validated_data.get("notes", "")

        warnings = compute_warnings(org_id=org_id, cells=cells, shift_id=str(shift_id))

        created = 0
        updated = 0
        for c in ser.validated_data["cells"]:
            obj, was_created = ShiftAssignment.all_objects.update_or_create(
                org_id=org_id,
                employee_id=c["employee_id"],
                work_date=c["work_date"],
                deleted_at__isnull=True,
                defaults={
                    "shift_id": shift_id,
                    "assigned_by": request.user.id,
                    "notes": notes,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        return Response({"created": created, "updated": updated, "warnings": warnings})

    @action(detail=False, methods=["post"], url_path="publish")
    def publish(self, request):
        ser = PublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        n = ScheduleService.publish_for_period(
            org_id=request.user.org_id,
            date_from=ser.validated_data["date_from"],
            date_to=ser.validated_data["date_to"],
        )
        return Response({"published": n})

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        from datetime import date as _date

        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if not date_from or not date_to:
            return Response(
                {"detail": "from and to query params required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            df = _date.fromisoformat(date_from)
            dt_ = _date.fromisoformat(date_to)
        except ValueError:
            return Response(
                {"detail": "from and to must be ISO date (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team_id = request.query_params.get("team_id") or None
        department_id = request.query_params.get("department_id") or None
        q = request.query_params.get("q") or None
        include_inactive = request.query_params.get("include_inactive") == "true"

        payload = build_calendar(
            org_id=request.user.org_id,
            date_from=df,
            date_to=dt_,
            team_id=team_id,
            department_id=department_id,
            q=q,
            include_inactive=include_inactive,
        )
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        emp = Employee.all_objects.filter(user_id=request.user.id).first()
        if emp is None:
            return Response([])
        qs = ShiftAssignment.all_objects.filter(
            employee=emp,
            deleted_at__isnull=True,
            published_at__isnull=False,
        )
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return Response(self.get_serializer(qs.order_by("work_date"), many=True).data)


@requires_feature("schedule")
class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        qs = Holiday.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )
        year = self.request.query_params.get("year")
        if year:
            try:
                qs = qs.filter(date__year=int(year))
            except ValueError:
                pass
        return qs.order_by("date")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:holiday:read"]
        return ["schedule:holiday:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)
