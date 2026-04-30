"""Attendance endpoints — clock-in/out, today, records, team."""

from __future__ import annotations

import datetime
from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import AttendanceRecord
from .serializers import AttendanceRecordSerializer
from .services import AttendanceService


def _client_ip(request) -> str | None:
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ua(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "")[:512]


@requires_feature("attendance")
class AttendanceViewSet(viewsets.GenericViewSet):
    """Clock-in/out + today + records list."""

    serializer_class = AttendanceRecordSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return AttendanceRecord.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).select_related("employee")

    @property
    def required_perms(self):
        if self.action in ("clock_in", "clock_out"):
            return ["attendance:clock:self"]
        if self.action in ("today",):
            return ["attendance:read:self"]
        if self.action == "records":
            return ["attendance:read:self"]
        if self.action == "team":
            return ["attendance:read:team"]
        return []

    def _employee_for_user(self):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        if emp is None:
            raise NotFound("No employee profile linked to this user.")
        return emp

    @action(detail=False, methods=["post"], url_path="clock-in")
    def clock_in(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.clock_in(
            employee=emp,
            source="web",
            ip=_client_ip(request),
            user_agent=_ua(request),
        )
        return Response(self.get_serializer(rec).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="clock-out")
    def clock_out(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.clock_out(
            employee=emp,
            source="web",
            ip=_client_ip(request),
            user_agent=_ua(request),
        )
        return Response(self.get_serializer(rec).data)

    @action(detail=False, methods=["get"], url_path="today")
    def today(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.today(employee=emp)
        if rec is None:
            return Response({"clock_in": None, "clock_out": None, "status": "no_record"})
        return Response(self.get_serializer(rec).data)

    @action(detail=False, methods=["get"], url_path="records")
    def records(self, request):
        """List own attendance records, with optional from/to date filters."""
        emp = self._employee_for_user()
        qs = self.get_queryset().filter(employee=emp)
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return Response(self.get_serializer(qs.order_by("-work_date"), many=True).data)

    @action(detail=False, methods=["get"], url_path="team")
    def team(self, request):
        """Team view (manager): all attendance for direct reports + self on a date."""
        emp = self._employee_for_user()
        target_date = request.query_params.get("date") or datetime.date.today().isoformat()
        # Include self + direct reports
        report_ids = list(Employee.all_objects.filter(manager=emp).values_list("id", flat=True))
        emp_ids = [*report_ids, emp.id]
        qs = self.get_queryset().filter(employee_id__in=emp_ids, work_date=target_date)
        return Response(self.get_serializer(qs.order_by("employee__employee_code"), many=True).data)
