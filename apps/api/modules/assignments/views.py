"""Assignment endpoints — Action Center feed + admin create/track."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .models import Assignment, AssignmentRecipient
from .serializers import AssignmentSerializer, RecipientSerializer
from .services import engine


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve", "archive"):
            return ["assignment:read:org"]
        # create: custom org/team check; me / complete: own rows (ownership-checked).
        return []

    def get_queryset(self):
        return Assignment.objects.filter(org_id=self.request.user.org_id)

    def _employee(self, request):
        return Employee.all_objects.filter(
            user_id=request.user.id, org_id=request.user.org_id, deleted_at__isnull=True
        ).first()

    def _gate_and_resolve(self, request) -> list:
        """Resolve the target employee ids, enforcing org-vs-team create scope."""
        perms = get_user_perms(request.user)
        target = request.data.get("target") or {}
        resolved = engine.resolve_targets(
            request.user.org_id, target.get("kind", ""), target.get("ids") or []
        )
        if "assignment:create:org" in perms:
            return resolved
        if "assignment:create:team" in perms:
            allowed = engine.manager_report_ids(request.user.id, request.user.org_id)
            return [e for e in resolved if e in allowed]
        raise PermissionDenied("You don't have permission to create assignments.")

    def create(self, request, *args, **kwargs):
        resolved = self._gate_and_resolve(request)
        s = AssignmentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        a = s.save(org_id=request.user.org_id, created_by=request.user.id)
        if request.data.get("publish", True):
            engine.publish(a, target_employee_ids=resolved, actor_id=request.user.id)
        return Response(AssignmentSerializer(a).data, status=drf_status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        a = self.get_object()
        recips = list(a.recipients.all())
        data = AssignmentSerializer(a).data
        data["summary"] = {
            "total": len(recips),
            "done": sum(1 for r in recips if r.status == "completed"),
            "overdue": sum(1 for r in recips if r.effective_status == "overdue"),
        }
        data["recipients"] = RecipientSerializer(recips, many=True).data
        return Response(data)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        emp = self._employee(request)
        if emp is None:
            return Response([])
        rows = (
            AssignmentRecipient.objects.filter(org_id=request.user.org_id, employee_id=emp.id)
            .select_related("assignment")
            .order_by("status", "due_date")
        )
        return Response(RecipientSerializer(rows, many=True).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        emp = self._employee(request)
        if emp is None:
            raise PermissionDenied("No linked employee record.")
        r = AssignmentRecipient.objects.filter(
            org_id=request.user.org_id, assignment_id=pk, employee_id=emp.id
        ).first()
        if r is None:
            raise NotFound("No assignment for you.")
        engine.complete(
            r, ip=request.META.get("REMOTE_ADDR", ""), note=request.data.get("note", "")
        )
        return Response(RecipientSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        resolved = self._gate_and_resolve(request)
        a = self.get_object()
        engine.publish(a, target_employee_ids=resolved, actor_id=request.user.id)
        return Response(AssignmentSerializer(a).data)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        a = self.get_object()
        a.status = "archived"
        a.save(update_fields=["status", "updated_at"])
        return Response(AssignmentSerializer(a).data)
