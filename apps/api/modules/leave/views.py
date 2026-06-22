"""Leave module views — types, balances, requests, approvals."""

from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.utils import timezone
from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.feature_flags.decorators import requires_feature
from common.workflow import Decision
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import EmployeeLeaveOverride, LeaveBalance, LeavePolicy, LeaveRequest, LeaveType
from .serializers import (
    EmployeeLeaveOverrideSerializer,
    LeaveActionSerializer,
    LeaveBalanceSerializer,
    LeavePolicySerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)
from .services.accrual import (
    run_carry_forward_expiry,
    run_year_end_carry_forward,
    run_year_start_accrual,
)
from .services.leave_request import LeaveRequestService


@requires_feature("leave")
class LeaveTypeViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveTypeSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["leave:request:read:self"]
        return ["leave:type:write"]

    @property
    def required_perms(self):
        return self.get_required_perms()

    def get_queryset(self):
        return LeaveType.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("code")

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    def perform_destroy(self, instance):
        instance.delete()  # soft-delete


@requires_feature("leave")
class LeavePolicyViewSet(viewsets.ModelViewSet):
    serializer_class = LeavePolicySerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["leave:request:read:self"]
        return ["leave:policy:write"]

    @property
    def required_perms(self):
        return self.get_required_perms()

    def get_queryset(self):
        qs = LeavePolicy.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("-effective_from")
        leave_type_id = self.request.query_params.get("leave_type")
        if leave_type_id:
            qs = qs.filter(leave_type_id=leave_type_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    def perform_destroy(self, instance):
        instance.delete()


@requires_feature("leave")
class EmployeeLeaveOverrideViewSet(viewsets.ModelViewSet):
    """CRUD for per-employee leave overrides.

    Endpoint: /api/v1/leave/employee-overrides/?employee={uuid}
    Read: leave:balance:adjust:org OR self (own employee).
    Write: leave:balance:adjust:org only.
    """

    serializer_class = EmployeeLeaveOverrideSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_required_perms(self):
        if self.action in ("list", "retrieve"):
            return []  # custom check below
        return ["leave:balance:adjust:org"]

    @property
    def required_perms(self):
        return self.get_required_perms()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.action in ("list", "retrieve"):
            employee_id = request.query_params.get("employee") or kwargs.get("employee_id")
            if not self._can_read(request, employee_id):
                raise PermissionDenied()

    def _can_read(self, request, employee_id) -> bool:
        from modules.identity.services.permissions import get_user_perms

        if "leave:balance:adjust:org" in get_user_perms(request.user):
            return True
        emp = Employee.all_objects.filter(user_id=request.user.id).first()
        return emp is not None and str(emp.id) == str(employee_id)

    def get_queryset(self):
        qs = EmployeeLeaveOverride.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("-effective_from")
        employee_id = self.request.query_params.get("employee")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs

    def perform_create(self, serializer):
        employee_id = self.request.data.get("employee_id") or self.request.query_params.get(
            "employee"
        )
        if not employee_id:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"employee_id": "Required."})
        serializer.save(
            org_id=self.request.user.org_id,
            employee_id=employee_id,
            created_by=self.request.user.id,
        )

    def perform_destroy(self, instance):
        instance.delete()


@requires_feature("leave")
class AdminAccrualViewSet(viewsets.ViewSet):
    """Manual accrual / carry-forward / expiry triggers (HR escape hatches)."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["leave:balance:adjust:org"]

    @action(detail=False, methods=["post"], url_path="accrue")
    def accrue(self, request):
        year = int(request.data.get("year"))
        dry_run = bool(request.data.get("dry_run", False))
        result = run_year_start_accrual(
            org_id=request.user.org_id,
            year=year,
            dry_run=dry_run,
        )
        return Response(result, status=drf_status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="carry-forward")
    def carry_forward(self, request):
        year = int(request.data.get("year"))
        dry_run = bool(request.data.get("dry_run", False))
        result = run_year_end_carry_forward(
            org_id=request.user.org_id,
            year=year,
            dry_run=dry_run,
        )
        return Response(result, status=drf_status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="expire-carry")
    def expire_carry(self, request):
        dry_run = bool(request.data.get("dry_run", False))
        result = run_carry_forward_expiry(dry_run=dry_run)
        return Response(result, status=drf_status.HTTP_200_OK)


@requires_feature("leave")
class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_required_perms(self):
        if self.action == "adjust":
            return ["leave:balance:adjust:org"]
        return []  # list/retrieve/me use the custom self/team/org check below

    @property
    def required_perms(self):
        return self.get_required_perms()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.action in ("list", "retrieve"):
            target = request.query_params.get("employee")
            if target and not self._can_read(request, target):
                raise PermissionDenied()

    def _can_read(self, request, employee_id) -> bool:
        from modules.identity.services.permissions import get_user_perms

        perms = get_user_perms(request.user)
        if "leave:balance:read:org" in perms:
            return True
        viewer = Employee.all_objects.filter(user_id=request.user.id).first()
        if viewer is None:
            return False
        if str(viewer.id) == str(employee_id):
            return "leave:balance:read:self" in perms
        # direct report → team scope
        target = Employee.all_objects.filter(
            id=employee_id, org_id=request.user.org_id
        ).first()
        if target and str(target.manager_id) == str(viewer.id):
            return "leave:balance:read:team" in perms
        return False

    def get_queryset(self):
        target = self.request.query_params.get("employee")
        emp_id = target or self._employee_id_for_request()
        if emp_id is None:
            return LeaveBalance.all_objects.none()
        return LeaveBalance.all_objects.filter(
            org_id=self.request.user.org_id,
            employee_id=emp_id,
            deleted_at__isnull=True,
        )

    def _employee_id_for_request(self):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        return emp.id if emp else None

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        emp_id = self._employee_id_for_request()
        qs = (
            LeaveBalance.all_objects.filter(
                org_id=request.user.org_id, employee_id=emp_id, deleted_at__isnull=True
            )
            if emp_id
            else LeaveBalance.all_objects.none()
        )
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=["post"], url_path="adjust")
    def adjust(self, request):
        """HR one-off balance adjustment (+/- days) → append-only ledger + audit."""
        from common.audit.service import append as audit_append

        from .services.balance import BalanceService

        employee_id = request.data.get("employee_id")
        leave_type_id = request.data.get("leave_type_id")
        note = (request.data.get("note") or "").strip()
        try:
            delta = Decimal(str(request.data.get("delta")))
        except (TypeError, ArithmeticError):
            raise ValidationError({"delta": "A non-zero number is required."}) from None
        if delta == 0:
            raise ValidationError({"delta": "Must be non-zero."})
        if not note:
            raise ValidationError({"note": "A reason is required."})
        leave_type = LeaveType.all_objects.filter(
            id=leave_type_id, org_id=request.user.org_id, deleted_at__isnull=True
        ).first()
        if leave_type is None:
            raise ValidationError({"leave_type_id": "Unknown leave type."})

        bal = BalanceService.manual_adjust(
            org_id=request.user.org_id,
            employee_id=employee_id,
            leave_type=leave_type,
            year=timezone.now().year,
            delta=delta,
            actor_id=request.user.id,
        )
        audit_append(
            org_id=request.user.org_id,
            action="leave.balance.adjusted",
            entity="leave_balance",
            entity_id=bal.id,
            after={
                "employee_id": str(employee_id),
                "leave_type": leave_type.code,
                "delta": str(delta),
                "note": note,
            },
        )
        return Response(self.get_serializer(bal).data)


@requires_feature("leave")
class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_required_perms(self):
        if self.action in ("create",):
            return ["leave:request:create:self"]
        if self.action in ("list", "retrieve"):
            return ["leave:request:read:self"]
        if self.action in ("submit", "withdraw", "cancel"):
            return ["leave:request:create:self"]
        if self.action in ("approve", "reject"):
            return ["leave:request:approve:team"]
        return []

    @property
    def required_perms(self):
        return self.get_required_perms()

    def get_queryset(self):
        # Approval actions need org-wide visibility (manager approving team member's request).
        if self.action in ("approve", "reject"):
            return LeaveRequest.all_objects.filter(
                org_id=self.request.user.org_id,
                deleted_at__isnull=True,
            )
        scope = self.request.query_params.get("scope", "self")
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        qs = LeaveRequest.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )
        if scope == "self":
            return qs.filter(employee_id=emp.id if emp else None)
        # 'team' / 'all' scopes filtered later (RBAC enforcement happens via required_perms)
        return qs

    def perform_create(self, serializer):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")
        serializer.save(org_id=self.request.user.org_id, employee_id=emp.id)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.submit(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = self.get_object()
        ser = LeaveActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        LeaveRequestService.act(
            req,
            actor=request.user,
            decision=Decision.APPROVE,
            comment=ser.validated_data.get("comment", ""),
        )
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        req = self.get_object()
        ser = LeaveActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        comment = ser.validated_data.get("comment", "").strip()
        if not comment:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"comment": "Required when rejecting"})
        LeaveRequestService.act(
            req,
            actor=request.user,
            decision=Decision.REJECT,
            comment=comment,
        )
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.cancel(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="withdraw")
    def withdraw(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.withdraw(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)


class LeaveCoverageView(APIView):
    """Team availability for a date window — powers the Apply calendar clash hints
    and the Approvals coverage badge.

    Any authenticated org user may read counts for their own team; teammate
    *names* are included only for callers holding ``leave:request:read:team``
    (managers / HR / approvers). With that perm, ``?employee_id=`` targets a
    specific person's team (e.g. when reviewing their request).
    """

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list[str]] = []

    def get(self, request):
        import datetime as _dt

        from modules.identity.services.permissions import get_user_perms

        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if not start or not end:
            return Response({"detail": "start and end are required"}, status=400)
        try:
            d_start = _dt.date.fromisoformat(start)
            d_end = _dt.date.fromisoformat(end)
        except ValueError:
            return Response({"detail": "start/end must be YYYY-MM-DD"}, status=400)

        perms = get_user_perms(request.user)
        can_team = "leave:request:read:team" in perms
        org_id = request.user.org_id

        emp_param = request.query_params.get("employee_id")
        caller = Employee.all_objects.filter(
            user_id=request.user.id, deleted_at__isnull=True
        ).first()
        if emp_param and can_team:
            target = Employee.all_objects.filter(
                id=emp_param, org_id=org_id, deleted_at__isnull=True
            ).first()
        else:
            target = caller
        if target is None:
            return Response({"team_size": 0, "per_day": {}, "people": []})

        peers = Employee.all_objects.filter(org_id=org_id, deleted_at__isnull=True).exclude(
            id=target.id
        )
        if target.manager_id:
            peers = peers.filter(manager_id=target.manager_id)
        elif target.department_id:
            peers = peers.filter(department_id=target.department_id)
        else:
            peers = peers.none()
        peer_map = {e.id: f"{e.first_name} {e.last_name}".strip() for e in peers}
        peer_ids = list(peer_map.keys())

        reqs = (
            LeaveRequest.all_objects.filter(
                org_id=org_id,
                employee_id__in=peer_ids,
                status__in=("approved", "submitted"),
                start_date__lte=d_end,
                end_date__gte=d_start,
                deleted_at__isnull=True,
            ).select_related("leave_type")
            if peer_ids
            else []
        )

        per_day: dict[str, int] = {}
        people: list[dict] = []
        for r in reqs:
            people.append(
                {
                    "employee_id": str(r.employee_id),
                    "name": peer_map.get(r.employee_id, ""),
                    "leave_type_code": r.leave_type.code,
                    "start": r.start_date.isoformat(),
                    "end": r.end_date.isoformat(),
                    "status": r.status,
                }
            )
            day = max(r.start_date, d_start)
            stop = min(r.end_date, d_end)
            while day <= stop:
                key = day.isoformat()
                per_day[key] = per_day.get(key, 0) + 1
                day += _dt.timedelta(days=1)

        return Response(
            {
                "team_size": len(peer_ids),
                "per_day": per_day,
                "people": people if can_team else [],
            }
        )
