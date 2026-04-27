"""Leave module views — types, balances, requests, approvals."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from common.workflow import Decision
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import LeaveBalance, LeaveRequest, LeaveType
from .serializers import (
    LeaveActionSerializer,
    LeaveBalanceSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)
from .services.leave_request import LeaveRequestService


class LeaveTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeaveTypeSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["leave:request:read:self"]

    def get_queryset(self):
        return LeaveType.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("code")


class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["leave:balance:read:self"]

    def get_queryset(self):
        emp_id = self._employee_id_for_request()
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
        return Response(self.get_serializer(self.get_queryset(), many=True).data)


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
