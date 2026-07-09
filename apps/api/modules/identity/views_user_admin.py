"""User-first admin create endpoint (v1.11.0 Task 7).

POST /api/v1/users/ provisions a User via the shared provision_user service
and, when an optional `employee` object is present, creates + links an Employee
in the same transaction so an inner failure rolls the user creation back.
"""

from __future__ import annotations

from typing import ClassVar

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.exceptions import ValidationError

from common.audit.service import append as audit_append
from modules.identity.models import User
from modules.identity.permissions import HRMSPermission
from modules.identity.serializers import UserAccountSerializer, UserCreateSerializer
from modules.identity.services.provisioning import provision_user


class UserCreateView(APIView):
    """Collection view for /users/ — POST create (user:create), GET list (user:read:org)."""

    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        return ["user:create"] if self.request.method == "POST" else ["user:read:org"]

    def get(self, request):
        status_filter = (request.query_params.get("status") or "active").lower()
        qs = User.objects.filter(org_id=request.user.org_id)
        if status_filter == "archived":
            qs = qs.filter(deleted_at__isnull=False)
        elif status_filter == "all":
            qs = qs.filter(deleted_at__isnull=True)
        elif status_filter == "disabled":
            qs = qs.filter(deleted_at__isnull=True, status="disabled")
        elif status_filter == "needs_linking":
            qs = qs.filter(deleted_at__isnull=True, employee_profile__isnull=True)
        else:  # active (default)
            qs = qs.filter(deleted_at__isnull=True, status="active")
        return Response(UserAccountSerializer(qs.order_by("email"), many=True).data)

    def post(self, request):
        s = UserCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        emp_data = v.get("employee")
        # deliver the invite to the personal email (top-level invite_email, or the
        # employee block's personal_email); the login stays the company email.
        invite_email = v.get("invite_email") or (emp_data or {}).get("personal_email") or None
        lg = v.get("leave_grant") or {}
        with transaction.atomic():
            user = provision_user(
                org_id=request.user.org_id,
                email=v["email"],
                role_code=v["role_code"],
                credential_method=v["credential_method"],
                temp_password=v.get("temp_password") or None,
                actor_id=request.user.id,
                invite_email=invite_email,
            )
            employee = None
            if emp_data:
                from modules.employee.serializers import EmployeeSerializer

                es = EmployeeSerializer(data=emp_data)
                es.is_valid(raise_exception=True)
                employee = es.save(org_id=request.user.org_id, user_id=user.id)
                audit_append(
                    org_id=request.user.org_id,
                    action="employee.user_linked",
                    entity="employee",
                    entity_id=employee.id,
                    after={"user_id": str(user.id), "provisioned": True},
                )
            if lg.get("enabled"):
                if employee is None:
                    raise ValidationError(
                        {"leave_grant": "Granting leave requires an employee record."}
                    )
                from modules.leave.services.initial_grant import grant_initial_leave

                grant_initial_leave(
                    employee=employee,
                    items=lg.get("items", []),
                    actor_id=request.user.id,
                )
        return Response({"id": str(user.id)}, status=status.HTTP_201_CREATED)
