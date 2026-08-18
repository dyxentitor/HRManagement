"""Schedule viewsets + custom actions (bulk-pattern, publish, /me)."""

from __future__ import annotations

from typing import ClassVar

from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import Holiday, Shift, ShiftAssignment, ShiftSwapRequest, WorkSchedule
from .serializers import (
    BulkAssignSerializer,
    HolidaySerializer,
    PublishSerializer,
    ShiftAssignmentSerializer,
    ShiftSerializer,
    ShiftSwapAssignmentBriefSerializer,
    ShiftSwapCreateSerializer,
    ShiftSwapRequestSerializer,
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
            "cover_up",
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

    @action(detail=True, methods=["patch"], url_path="cover-up")
    def cover_up(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError

        assignment = self.get_object()
        new_id = request.data.get("covering_for_id")
        if new_id is not None and str(new_id) == str(assignment.employee_id):
            return Response(
                {"detail": "An employee cannot cover for themselves."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assignment.covering_for_id = new_id
        try:
            assignment.full_clean()
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
        assignment.save(update_fields=["covering_for"])
        return Response(self.get_serializer(assignment).data)

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


@requires_feature("schedule")
class ShiftSwapRequestViewSet(viewsets.ModelViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]
    http_method_names: ClassVar[list[str]] = ["get", "post", "head", "options"]
    serializer_class = ShiftSwapRequestSerializer

    @property
    def required_perms(self):
        if self.action in ("approve", "reject"):
            return ["schedule:swap:approve:team"]
        if self.action == "list" and self.request.query_params.get("scope") == "team":
            return ["schedule:swap:approve:team"]
        return ["schedule:swap:request:self"]

    def _me(self):
        return Employee.all_objects.filter(
            user_id=self.request.user.id, deleted_at__isnull=True
        ).first()

    def get_queryset(self):
        qs = ShiftSwapRequest.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True
        ).select_related(
            "requester", "counterparty",
            "requester_assignment__shift", "requester_assignment__employee",
            "counterparty_assignment__shift", "counterparty_assignment__employee",
        )
        if self.action == "list" and self.request.query_params.get("scope") == "team":
            return qs.filter(status="pending").order_by("-created_at")
        me = self._me()
        if me is None:
            return qs.none()
        return qs.filter(requester=me).order_by("-created_at")

    def get_object(self):
        if self.action in ("approve", "reject", "cancel"):
            obj = ShiftSwapRequest.all_objects.filter(
                org_id=self.request.user.org_id,
                pk=self.kwargs["pk"],
                deleted_at__isnull=True,
            ).select_related(
                "requester", "counterparty",
                "requester_assignment__shift", "requester_assignment__employee",
                "counterparty_assignment__shift", "counterparty_assignment__employee",
            ).first()
            if obj is None:
                raise NotFound("Swap request not found.")
            return obj
        return super().get_object()

    def create(self, request, *args, **kwargs):
        from .services.swap import SwapValidationError, validate_pair

        ser = ShiftSwapCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        me = self._me()
        if me is None:
            raise ValidationError({"detail": "Your user is not linked to an employee record."})

        org_id = request.user.org_id
        rows = ShiftAssignment.all_objects.filter(
            org_id=org_id, deleted_at__isnull=True,
            id__in=(
                ser.validated_data["requester_assignment"],
                ser.validated_data["counterparty_assignment"],
            ),
        ).select_related("shift", "employee")
        by_id = {str(r.id): r for r in rows}
        a1 = by_id.get(str(ser.validated_data["requester_assignment"]))
        a2 = by_id.get(str(ser.validated_data["counterparty_assignment"]))
        if a1 is None or a2 is None:
            raise ValidationError({"detail": "Shift assignment not found."})

        try:
            validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=me)
        except SwapValidationError as exc:
            raise ValidationError({"detail": exc.message}) from exc

        req = ShiftSwapRequest.all_objects.create(
            org_id=org_id,
            requester_assignment=a1,
            counterparty_assignment=a2,
            requester=me,
            counterparty=a2.employee,
            reason=ser.validated_data.get("reason", ""),
        )
        return Response(
            self.get_serializer(req).data, status=status.HTTP_201_CREATED
        )

    def _assert_is_approver(self, req):
        """Holding the perm is not enough — the actor must be THIS requester's
        approver. resolve_approvers excludes the requester, so this also blocks
        self-approval (CLAUDE.md §3.11, the v1.10.1 guard)."""
        from .services.swap import resolve_approvers

        allowed = {u.id for u in resolve_approvers(requester=req.requester)}
        if self.request.user.id not in allowed:
            raise PermissionDenied("You are not an approver for this request.")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        from .services.swap import SwapValidationError, execute_swap

        req = self.get_object()
        self._assert_is_approver(req)
        try:
            execute_swap(
                swap_request=req,
                actor_id=request.user.id,
                note=request.data.get("note", ""),
            )
        except SwapValidationError as exc:
            raise ValidationError({"detail": exc.message}) from exc
        req.requester_assignment.refresh_from_db()
        req.counterparty_assignment.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        req = self.get_object()
        self._assert_is_approver(req)
        if req.status != "pending":
            raise ValidationError({"detail": "Only a pending swap can be rejected."})
        req.status = "rejected"
        req.decided_by = request.user.id
        req.decided_at = timezone.now()
        req.decision_note = request.data.get("note", "")
        req.save(
            update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"]
        )
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        req = self.get_object()
        me = self._me()
        if me is None or req.requester_id != me.id:
            raise PermissionDenied("You can only cancel your own swap request.")
        if req.status != "pending":
            raise ValidationError({"detail": "Only a pending swap can be cancelled."})
        req.status = "cancelled"
        req.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(req).data)

    @action(detail=False, methods=["get"])
    def candidates(self, request):
        """Teammates' future published shifts, for the swap picker.

        Deliberately NOT pre-filtered for conflicts (spec §8) — an impossible
        pair is refused at submit with a message naming the blocker, so the
        user learns why rather than silently seeing fewer options.
        """
        assignment_id = request.query_params.get("assignment_id")
        if not assignment_id:
            raise ValidationError({"assignment_id": "This query parameter is required."})

        me = self._me()
        if me is None:
            return Response([])

        try:
            own = (
                ShiftAssignment.all_objects.filter(
                    id=assignment_id,
                    org_id=request.user.org_id,
                    employee_id=me.id,
                    deleted_at__isnull=True,
                )
                .select_related("shift")
                .first()
            )
        except DjangoValidationError:
            raise ValidationError({"assignment_id": "Not one of your shift assignments."})
        if own is None:
            raise ValidationError({"assignment_id": "Not one of your shift assignments."})

        qs = (
            ShiftAssignment.all_objects.filter(
                org_id=request.user.org_id,
                deleted_at__isnull=True,
                published_at__isnull=False,
                status="scheduled",
                work_date__gt=timezone.localdate(),
                employee__status="active",
            )
            .exclude(employee_id=me.id)
            .select_related("employee", "shift")
            .order_by("work_date", "employee__employee_code")
        )
        return Response(ShiftSwapAssignmentBriefSerializer(qs, many=True).data)
