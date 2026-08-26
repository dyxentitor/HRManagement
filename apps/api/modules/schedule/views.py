"""Schedule viewsets + custom actions (bulk-pattern, publish, /me)."""

from __future__ import annotations

import datetime
import uuid
from typing import ClassVar

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission
from modules.organization.models import Organization

from .models import Holiday, Shift, ShiftAssignment, ShiftSwapRequest, WorkSchedule
from .serializers import (
    BulkAssignSerializer,
    HolidaySerializer,
    PublishSerializer,
    ShiftAssignmentSerializer,
    ShiftSerializer,
    ShiftSwapCreateSerializer,
    ShiftSwapRequestSerializer,
    SwapCandidateSerializer,
    WorkScheduleSerializer,
)
from .services.calendar import build_calendar
from .services.holiday import HolidayService, reconcile_org_holidays
from .services.schedule import ScheduleService
from .services.swap import batch_pair_reasons
from .services.warnings import compute_warnings

# Swap-candidate search tuning. The page size matches the drawer's "show 6-10
# initially" design; the horizon stops a year-ahead roster becoming an
# unbounded scan.
_CANDIDATE_HORIZON_DAYS = 60
_CANDIDATE_PAGE_SIZE = 8
_CANDIDATE_MAX_PAGE_SIZE = 50
_CANDIDATE_SEARCH_MIN_CHARS = 2


def _pending_assignment_ids_for_org(org_id) -> set:
    """Every assignment id tied to a pending swap request in this org.

    Bounded by the number of *pending requests*, not by the roster size, so
    this stays cheap however large the org's schedule grows.
    """
    pairs = ShiftSwapRequest.all_objects.filter(
        org_id=org_id, status="pending", deleted_at__isnull=True
    ).values_list("requester_assignment_id", "counterparty_assignment_id")
    return {aid for pair in pairs for aid in pair}


def _shift_hours(shift) -> float:
    """Paid length of a shift template, in hours."""
    start = datetime.datetime.combine(datetime.date.min, shift.start_time)
    end = datetime.datetime.combine(datetime.date.min, shift.end_time)
    if shift.crosses_midnight or end <= start:
        end += datetime.timedelta(days=1)
    return (end - start).total_seconds() / 3600


def _candidate_warnings(own, other) -> list:
    """Soft, non-blocking flags shown on a candidate card.

    Never a reason to hide a row — these are things the employee should notice
    before trading, not rules the backend enforces.
    """
    out = []
    if other.shift.crosses_midnight and not own.shift.crosses_midnight:
        out.append("Overnight shift — ends the following morning.")
    delta = round(_shift_hours(other.shift) - _shift_hours(own.shift), 1)
    if delta > 0:
        out.append(f"{delta:g}h longer than your shift.")
    elif delta < 0:
        out.append(f"{abs(delta):g}h shorter than your shift.")
    return out


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
            _obj, was_created = ShiftAssignment.all_objects.update_or_create(
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
        # Anything a human adds here is tenant-owned by definition, so it is
        # marked protected and a later provider import will not touch it.
        serializer.save(
            org_id=self.request.user.org_id,
            source=Holiday.SOURCE_COMPANY,
            source_key="",
        )

    def perform_update(self, serializer):
        # Editing an imported row promotes it to an organization override, so
        # the next reconcile reports a conflict instead of silently reverting
        # the human's decision.
        instance = serializer.instance
        if instance.source == Holiday.SOURCE_IMPORT:
            serializer.save(source=Holiday.SOURCE_OVERRIDE)
        else:
            serializer.save()

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        """Publish a provisional holiday. The explicit administrator step."""
        row = HolidayService.confirm(
            org_id=request.user.org_id, holiday_id=pk, actor_id=request.user.id
        )
        return Response(self.get_serializer(row).data)

    @action(detail=False, methods=["get"], url_path="sync-preview")
    def sync_preview(self, request):
        """Dry-run reconcile for the admin UI. Never writes, never calls out.

        The provider is only ever reached by the management command; this
        reads the already-imported local reference table.
        """
        self.required_perms  # noqa: B018 — permission check runs in HRMSPermission
        try:
            year = int(request.query_params.get("year", ""))
        except ValueError:
            return Response(
                {"detail": "A numeric `year` query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        org = Organization.objects.filter(id=request.user.org_id).first()
        if org is None:
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
        stats = reconcile_org_holidays(org=org, year=year, dry_run=True)
        return Response(
            {
                "year": year,
                "counts": stats.as_dict(),
                "changes": stats.changes,
                "conflicts": stats.conflicts,
            }
        )


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
            "requester",
            "counterparty",
            "requester_assignment__shift",
            "requester_assignment__employee",
            "counterparty_assignment__shift",
            "counterparty_assignment__employee",
        )
        if self.action == "list" and self.request.query_params.get("scope") == "team":
            return qs.filter(status="pending").order_by("-created_at")
        me = self._me()
        if me is None:
            return qs.none()
        return qs.filter(requester=me).order_by("-created_at")

    def get_object(self):
        if self.action in ("approve", "reject", "cancel"):
            obj = (
                ShiftSwapRequest.all_objects.filter(
                    org_id=self.request.user.org_id,
                    pk=self.kwargs["pk"],
                    deleted_at__isnull=True,
                )
                .select_related(
                    "requester",
                    "counterparty",
                    "requester_assignment__shift",
                    "requester_assignment__employee",
                    "counterparty_assignment__shift",
                    "counterparty_assignment__employee",
                )
                .first()
            )
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
            org_id=org_id,
            deleted_at__isnull=True,
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
        return Response(self.get_serializer(req).data, status=status.HTTP_201_CREATED)

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
        _notify_swap(
            req,
            type_code="schedule.swap.approved",
            users=_users_for(req.requester, req.counterparty),
        )
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        req = self.get_object()
        self._assert_is_approver(req)
        with transaction.atomic():
            locked = ShiftSwapRequest.all_objects.select_for_update().filter(id=req.id).first()
            if locked is None or locked.status != "pending":
                raise ValidationError({"detail": "Only a pending swap can be rejected."})
            locked.status = "rejected"
            locked.decided_by = request.user.id
            locked.decided_at = timezone.now()
            locked.decision_note = request.data.get("note", "")
            locked.save(
                update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"]
            )
            # Reflect onto the caller's object so the serialiser sees the new state.
            req.status = locked.status
            req.decided_by = locked.decided_by
            req.decided_at = locked.decided_at
            req.decision_note = locked.decision_note
        _notify_swap(
            req,
            type_code="schedule.swap.rejected",
            users=_users_for(req.requester),
        )
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        req = self.get_object()
        me = self._me()
        if me is None or req.requester_id != me.id:
            raise PermissionDenied("You can only cancel your own swap request.")
        with transaction.atomic():
            locked = ShiftSwapRequest.all_objects.select_for_update().filter(id=req.id).first()
            if locked is None or locked.status != "pending":
                raise ValidationError({"detail": "Only a pending swap can be cancelled."})
            locked.status = "cancelled"
            locked.save(update_fields=["status", "updated_at"])
            req.status = locked.status
        return Response(self.get_serializer(req).data)

    @action(detail=False, methods=["get"])
    def candidates(self, request):
        """Teammates' future published shifts, for the swap picker.

        Paged and server-filtered: the browser never receives the whole
        workforce roster. Rows that could never be swapped (already tied to a
        pending request, identical slot, unpublished, cancelled, past,
        inactive employee, another tenant) are excluded outright. Rows that
        merely *conflict* with the requester's roster are still returned but
        flagged `compatible: false` with the blocking reason — spec §8: an
        impossible pair should teach the user why rather than silently
        vanishing. Either way the submit path re-runs `validate_pair`, so this
        list is a convenience, never an authorisation.

        Query params: q, date_from, date_to, shift, team, department,
        page, page_size.
        """
        me = self._me()
        own = self._own_assignment(request, me)

        org_id = request.user.org_id
        today = timezone.localdate()
        # Cap the horizon so an org that publishes a year ahead can't be asked
        # for an unbounded scan; date_from/date_to narrow it further.
        window_start, window_end = self._candidate_window(request, today)

        qs = (
            ShiftAssignment.all_objects.filter(
                org_id=org_id,
                deleted_at__isnull=True,
                published_at__isnull=False,
                status="scheduled",
                work_date__gte=window_start,
                work_date__lte=window_end,
                employee__status="active",
                employee__deleted_at__isnull=True,
            )
            .exclude(employee_id=me.id)
            # Same date AND same shift is a no-op swap.
            .exclude(work_date=own.work_date, shift_id=own.shift_id)
            .select_related("employee", "employee__department", "employee__team", "shift")
        )
        qs = self._apply_candidate_filters(qs, request)

        # Rows already spoken for by a pending request can never be swapped —
        # drop them rather than paging the user past dead options.
        blocked = _pending_assignment_ids_for_org(org_id)
        if blocked:
            qs = qs.exclude(id__in=blocked)

        # Rank compatible rows first *in SQL* so page 1 is useful without
        # having to pull every row into memory to sort it. The two conflict
        # sets are small and cheap; the authoritative per-row reason is still
        # computed below, for the page only.
        my_busy_dates = set(
            ShiftAssignment.all_objects.filter(
                employee_id=me.id,
                work_date__gte=window_start,
                work_date__lte=window_end,
                deleted_at__isnull=True,
            )
            .exclude(id=own.id)
            .values_list("work_date", flat=True)
        )
        busy_on_my_date = set(
            ShiftAssignment.all_objects.filter(
                org_id=org_id,
                work_date=own.work_date,
                deleted_at__isnull=True,
            )
            .exclude(employee_id=me.id)
            .values_list("employee_id", flat=True)
        )
        conflict_q = Q(work_date__in=my_busy_dates) | (
            Q(employee_id__in=busy_on_my_date) & ~Q(work_date=own.work_date)
        )
        qs = qs.annotate(
            _rank=Case(
                When(conflict_q, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        ).order_by("_rank", "work_date", "employee__employee_code")

        page, page_size = self._candidate_page(request)
        count = qs.count()
        rows = list(qs[(page - 1) * page_size : page * page_size])

        # One batched evaluation for the page — same rule list as submit.
        reasons = batch_pair_reasons(own=own, rows=rows, requester=me, org_id=org_id)
        warnings = {r.id: _candidate_warnings(own, r) for r in rows}

        ser = SwapCandidateSerializer(
            rows, many=True, context={"reasons": reasons, "warnings": warnings}
        )
        return Response(
            {
                "results": ser.data,
                "count": count,
                "page": page,
                "page_size": page_size,
                # Non-null when the requester's OWN shift is unswappable, so the
                # empty state can explain itself instead of just saying "none".
                "blocked_reason": (
                    "There is already a pending swap for this shift." if own.id in blocked else None
                ),
            }
        )

    def _own_assignment(self, request, me):
        """The requester's own assignment named by `assignment_id`, or 400."""
        assignment_id = request.query_params.get("assignment_id")
        if not assignment_id:
            raise ValidationError({"assignment_id": "This query parameter is required."})
        if me is None:
            raise ValidationError({"assignment_id": "Not one of your shift assignments."})
        try:
            own = (
                ShiftAssignment.all_objects.filter(
                    id=assignment_id,
                    org_id=request.user.org_id,
                    employee_id=me.id,
                    deleted_at__isnull=True,
                )
                .select_related("shift", "employee")
                .first()
            )
        except DjangoValidationError as exc:
            raise ValidationError({"assignment_id": "Not one of your shift assignments."}) from exc
        if own is None:
            raise ValidationError({"assignment_id": "Not one of your shift assignments."})
        return own

    @staticmethod
    def _candidate_window(request, today):
        """[start, end] to scan, clamped to (today, today + 60d]."""
        horizon_end = today + datetime.timedelta(days=_CANDIDATE_HORIZON_DAYS)
        start = today + datetime.timedelta(days=1)
        end = horizon_end
        raw_from = request.query_params.get("date_from")
        raw_to = request.query_params.get("date_to")
        if raw_from:
            parsed = parse_date(raw_from)
            if parsed is None:
                raise ValidationError({"date_from": "Expected a YYYY-MM-DD date."})
            start = max(start, parsed)
        if raw_to:
            parsed = parse_date(raw_to)
            if parsed is None:
                raise ValidationError({"date_to": "Expected a YYYY-MM-DD date."})
            end = min(end, parsed)
        return start, end

    @staticmethod
    def _apply_candidate_filters(qs, request):
        """Name search + shift / team / department narrowing, all server-side."""
        q = (request.query_params.get("q") or "").strip()
        if len(q) >= _CANDIDATE_SEARCH_MIN_CHARS:
            qs = qs.filter(
                Q(employee__first_name__icontains=q)
                | Q(employee__last_name__icontains=q)
                | Q(employee__employee_code__icontains=q)
            )
        for param, field in (
            ("shift", "shift_id"),
            ("team", "employee__team_id"),
            ("department", "employee__department_id"),
        ):
            raw = (request.query_params.get(param) or "").strip()
            if not raw:
                continue
            try:
                qs = qs.filter(**{field: uuid.UUID(raw)})
            except (ValueError, AttributeError) as exc:
                raise ValidationError({param: "Expected a UUID."}) from exc
        return qs

    @staticmethod
    def _candidate_page(request):
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(
                _CANDIDATE_MAX_PAGE_SIZE,
                max(1, int(request.query_params.get("page_size", _CANDIDATE_PAGE_SIZE))),
            )
        except (TypeError, ValueError):
            page, page_size = 1, _CANDIDATE_PAGE_SIZE
        return page, page_size


def _notify_swap(swap_request, *, type_code: str, users) -> None:
    """Best-effort swap notification — never raises into the request cycle."""
    import logging

    from modules.notification.services.notify import notify

    for user in users:
        if user is None:
            continue
        try:
            notify(
                user=user,
                type=type_code,
                payload={
                    "swap_id": str(swap_request.id),
                    "requester": swap_request.requester.full_name,
                    "counterparty": swap_request.counterparty.full_name,
                },
                deep_link="/schedule",
                priority="normal",
            )
        except Exception:
            logging.getLogger(__name__).exception("swap notify failed")


def _users_for(*employees):
    from modules.identity.models import User

    ids = [e.user_id for e in employees if e is not None and e.user_id]
    return list(User.objects.filter(id__in=ids))
