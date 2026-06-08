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

from common.audit.service import append as audit_append
from modules.identity.permissions import HRMSPermission
from modules.identity.serializers import UserCreateSerializer
from modules.identity.services.provisioning import provision_user


class UserCreateView(APIView):
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["user:create"]

    def post(self, request):
        s = UserCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        with transaction.atomic():
            user = provision_user(
                org_id=request.user.org_id,
                email=v["email"],
                role_code=v["role_code"],
                credential_method=v["credential_method"],
                temp_password=v.get("temp_password") or None,
                actor_id=request.user.id,
            )
            emp_data = v.get("employee")
            if emp_data:
                from modules.employee.serializers import EmployeeSerializer

                es = EmployeeSerializer(data=emp_data)
                es.is_valid(raise_exception=True)
                emp = es.save(org_id=request.user.org_id, user_id=user.id)
                audit_append(
                    org_id=request.user.org_id,
                    action="employee.user_linked",
                    entity="employee",
                    entity_id=emp.id,
                    after={"user_id": str(user.id), "provisioned": True},
                )
        return Response({"id": str(user.id)}, status=status.HTTP_201_CREATED)
