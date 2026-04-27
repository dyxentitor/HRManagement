"""Employee CRUD viewset + /employees/me shortcut."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import Employee
from .serializers import EmployeeMeSerializer, EmployeeSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    """HR-facing employee CRUD."""

    serializer_class = EmployeeSerializer
    permission_classes: ClassVar = [HRMSPermission]
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
        if action in ("list", "retrieve"):
            return ["employee:read:org"]
        if action == "create":
            return ["employee:create"]
        if action in ("update", "partial_update"):
            return ["employee:write:org"]
        if action == "destroy":
            return ["employee:archive"]
        return []

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request, *args, **kwargs):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")

        if request.method == "GET":
            ser = EmployeeMeSerializer(emp, context={"request": request})
            return Response(ser.data)

        # PATCH: self-edit whitelist
        ser = EmployeeMeSerializer(
            emp, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        # Recompute *_last4 helpers if relevant
        bank_no = request.data.get("bank_account_number")
        if bank_no:
            emp.bank_account_last4 = bank_no[-4:]
            emp.save(update_fields=["bank_account_last4", "updated_at"])
        return Response(ser.data, status=status.HTTP_200_OK)
