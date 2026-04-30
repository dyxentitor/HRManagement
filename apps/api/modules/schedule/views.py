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
from .services.schedule import ScheduleService


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
        )
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
        if self.action in ("list", "retrieve"):
            return ["schedule:assignment:read:team"]
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
            "bulk_pattern",
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
