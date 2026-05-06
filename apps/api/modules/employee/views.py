"""Employee CRUD viewset + /employees/me shortcut."""

from __future__ import annotations

import datetime
from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import Employee, Team
from .serializers import (
    EmployeeAssignmentSerializer,
    EmployeeMeSerializer,
    EmployeeSerializer,
    TeamSerializer,
)


class EmployeeViewSet(viewsets.ModelViewSet):
    """HR-facing employee CRUD."""

    serializer_class = EmployeeSerializer
    permission_classes: ClassVar = [HRMSPermission]
    BANK_FIELDS: ClassVar[frozenset[str]] = frozenset({"bank_name", "bank_account_number"})
    ASSIGN_SCOPE_KEYS: ClassVar[frozenset[str]] = frozenset({"team", "team_id"})
    # Use get_queryset() so TenantScopedManager re-evaluates org_id at request time.
    # A class-level queryset = Employee.objects.all() would capture org_id=None at
    # class-load time and always return empty results.
    queryset = Employee.objects.none()  # required by DRF router for basename detection

    def get_queryset(self):
        return Employee.objects.all()

    @property
    def required_perms(self) -> list[str]:
        action = self.action
        if action == "me":
            if self.request.method == "GET":
                return ["employee:read:self"]
            return ["employee:write:self"]
        if action in ("list", "retrieve", "reporting_chain", "direct_reports", "probation_status"):
            return ["employee:read:org"]
        if action == "create":
            return ["employee:create"]
        if action == "update":
            return ["employee:write:org"]
        if action == "partial_update":
            # Both perm branches handled inside `partial_update`. Returning []
            # leaves auth + tenant-scope intact via HRMSPermission.
            return []
        if action == "destroy":
            return ["employee:archive"]
        return []

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied

        from modules.identity.services.permissions import get_user_perms

        user_perms = get_user_perms(request.user)
        body_keys = set(request.data.keys())

        if "employee:write:org" in user_perms:
            return super().partial_update(request, *args, **kwargs)

        if (
            "employee:assign:team" in user_perms
            and body_keys
            and body_keys.issubset(self.ASSIGN_SCOPE_KEYS)
        ):
            instance = self.get_object()
            ser = EmployeeAssignmentSerializer(
                instance,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(EmployeeSerializer(instance, context={"request": request}).data)

        raise PermissionDenied("You do not have permission to edit this employee.")

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request, *args, **kwargs):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")

        if request.method == "GET":
            return Response(EmployeeMeSerializer(emp, context={"request": request}).data)

        # Re-MFA check on bank fields
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from modules.identity.services.mfa import verify_code_for_user

            mfa_code = request.headers.get("X-MFA-Code", "")
            if not mfa_code:
                raise ValidationError({"mfa": "X-MFA-Code header required for bank field changes"})
            if not verify_code_for_user(request.user, mfa_code):
                raise ValidationError({"mfa": "Invalid MFA code"})

        ser = EmployeeMeSerializer(
            emp, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        ser.save()

        # Recompute bank_account_last4 if bank_account_number was supplied
        if request.data.get("bank_account_number"):
            emp.bank_account_last4 = request.data["bank_account_number"][-4:]
            emp.save(update_fields=["bank_account_last4", "updated_at"])

        # Notify HR if any bank field changed
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from .services import EmployeeService

            EmployeeService.notify_hr_of_bank_change(emp)

        return Response(ser.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="reporting-chain")
    def reporting_chain(self, request, pk=None):
        emp = self.get_object()
        from modules.identity.services.org import OrgService

        chain = OrgService().get_reporting_chain(emp.id)
        ser = self.get_serializer(chain, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="direct-reports")
    def direct_reports(self, request, pk=None):
        emp = self.get_object()
        reports = Employee.objects.filter(manager=emp)
        ser = self.get_serializer(reports, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="probation-status")
    def probation_status(self, request, pk=None):
        emp = self.get_object()
        end = emp.probation_end_date
        if end is None:
            body = {"status": "confirmed", "days_remaining": None, "probation_end_date": None}
        else:
            today = datetime.date.today()
            delta = (end - today).days
            if delta > 0:
                status_str = "in_probation"
            elif delta == 0:
                status_str = "due_today"
            else:
                status_str = "overdue_confirmation"
            body = {
                "status": status_str,
                "days_remaining": delta,
                "probation_end_date": end.isoformat(),
            }
        return Response(body)


class TeamViewSet(viewsets.ModelViewSet):
    """CRUD for org-defined work teams used to group roster rows."""

    serializer_class = TeamSerializer
    permission_classes: ClassVar = [HRMSPermission]
    queryset = Team.objects.none()  # required by DRF router for basename detection

    def get_queryset(self):
        return Team.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("sort_order", "name")

    @property
    def required_perms(self) -> list[str]:
        if self.action in ("list", "retrieve"):
            return ["team:read"]
        return ["team:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)
