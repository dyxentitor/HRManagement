"""Read-only Organization Chart endpoints (v1.54.0).

Compact, lazy-loadable hierarchy for the People → Organization Chart tab.
Every action requires ``employee:read:org`` (same gate as the employee list and
the reporting-chain / direct-reports endpoints).
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission
from modules.organization.models import Department

from .serializers_org_chart import OrgNodeSerializer, OrgSearchHitSerializer
from .services import org_chart


class OrgChartViewSet(viewsets.ViewSet):
    """Lazy org-hierarchy reads for the Organization Chart."""

    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self) -> list[str]:
        return ["employee:read:org"]

    def _org(self):
        return self.request.user.org_id

    @action(detail=False, methods=["get"])
    def roots(self, request):
        qs = org_chart.roots_qs(self._org())
        return Response(OrgNodeSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def children(self, request):
        manager_id = request.query_params.get("manager")
        if not manager_id:
            raise ValidationError({"manager": "This query parameter is required."})
        qs = org_chart.children_qs(self._org(), manager_id)
        return Response(OrgNodeSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def search(self, request):
        results = org_chart.search_nodes(self._org(), request.query_params.get("q", ""))
        employees = []
        for emp, ancestors in results:
            emp.ancestor_ids = ancestors
            employees.append(emp)
        return Response(OrgSearchHitSerializer(employees, many=True).data)

    @action(detail=False, methods=["get"])
    def departments(self, request):
        return Response(org_chart.department_groups(self._org()))

    @action(
        detail=False,
        methods=["get"],
        url_path="departments/(?P<dept_id>[^/.]+)/members",
    )
    def department_members(self, request, dept_id=None):
        if not Department.all_objects.filter(
            org_id=self._org(), id=dept_id, deleted_at__isnull=True
        ).exists():
            raise NotFound("Department not found.")
        qs = org_chart.department_members_qs(self._org(), dept_id)
        return Response(OrgNodeSerializer(qs, many=True).data)
