"""Assignment endpoints — Action Center feed + admin create/track."""

from __future__ import annotations

import datetime as dt
from typing import ClassVar

from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .models import Assignment, AssignmentQuestion, AssignmentRecipient, AssignmentResponse
from .serializers import AssignmentSerializer, QuestionSerializer, RecipientSerializer
from .services import engine


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve", "archive", "responses", "analytics", "revise"):
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
        if a.type == "questionnaire":
            for i, q in enumerate(request.data.get("questions") or []):
                AssignmentQuestion.objects.create(
                    org_id=request.user.org_id,
                    assignment=a,
                    order=i,
                    text=(q.get("text") or "")[:500],
                    qtype=q.get("qtype") or "single_choice",
                    options=q.get("options") or [],
                    required=q.get("required", True),
                )
        if a.recurrence != "none":
            # Recurring → template; store the *resolved* ids so manager-scope survives
            # each re-fan-out, spawn the first occurrence now, schedule the next.
            a.is_template = True
            a.target_spec = {"kind": "employee", "ids": [str(x) for x in resolved]}
            a.next_run_at = engine.advance_date(
                dt.date.today(), a.recurrence, a.recurrence_interval
            )
            a.save(update_fields=["is_template", "target_spec", "next_run_at"])
            engine.spawn_instance(a)
        elif request.data.get("publish", True):
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

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        org_id = request.user.org_id
        recips = list(
            AssignmentRecipient.objects.filter(org_id=org_id).select_related("assignment")
        )
        total = len(recips)
        completed = sum(1 for r in recips if r.status == "completed")
        overdue = sum(1 for r in recips if r.effective_status == "overdue")
        emp_dept = dict(
            Employee.all_objects.filter(org_id=org_id, deleted_at__isnull=True).values_list(
                "id", "department__name"
            )
        )
        by_dept: dict = {}
        by_type: dict = {}
        for r in recips:
            d = emp_dept.get(r.employee_id) or "—"
            bd = by_dept.setdefault(d, {"department": d, "total": 0, "completed": 0, "overdue": 0})
            bd["total"] += 1
            bd["completed"] += r.status == "completed"
            bd["overdue"] += r.effective_status == "overdue"
            bt = by_type.setdefault(
                r.assignment.type, {"type": r.assignment.type, "total": 0, "completed": 0}
            )
            bt["total"] += 1
            bt["completed"] += r.status == "completed"
        return Response(
            {
                "totals": {
                    "total": total,
                    "completed": completed,
                    "overdue": overdue,
                    "pending": total - completed,
                    "completion_rate": round(completed / total * 100) if total else 0,
                },
                "by_department": sorted(by_dept.values(), key=lambda x: -x["total"]),
                "by_type": list(by_type.values()),
            }
        )

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
        evidence_key = request.data.get("evidence_s3_key", "")
        if r.assignment.requires_evidence and not evidence_key:
            raise ValidationError({"evidence_s3_key": "Proof upload is required to complete this."})
        engine.complete(
            r,
            ip=request.META.get("REMOTE_ADDR", ""),
            note=request.data.get("note", ""),
            evidence_s3_key=evidence_key,
        )
        return Response(RecipientSerializer(r).data)

    @action(detail=True, methods=["post"], url_path="evidence-url")
    def evidence_url(self, request, pk=None):
        r = self._own_recipient(request, pk)
        url, key = engine.evidence_upload_url(
            pk, r.employee_id, request.data.get("content_type", "")
        )
        return Response({"url": url, "key": key})

    @action(detail=True, methods=["post"], url_path="revise")
    def revise(self, request, pk=None):
        a = self.get_object()
        reopened = engine.revise(a, actor_id=request.user.id)
        return Response({"version": a.version, "reopened": reopened})

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

    def _own_recipient(self, request, pk):
        emp = self._employee(request)
        if emp is None:
            raise PermissionDenied("No linked employee record.")
        r = AssignmentRecipient.objects.filter(
            org_id=request.user.org_id, assignment_id=pk, employee_id=emp.id
        ).first()
        if r is None:
            raise NotFound("No assignment for you.")
        return r

    @action(detail=True, methods=["get"], url_path="questionnaire")
    def questionnaire(self, request, pk=None):
        r = self._own_recipient(request, pk)
        a = self.get_object()
        return Response(
            {
                "assignment": AssignmentSerializer(a).data,
                "questions": QuestionSerializer(a.questions.all(), many=True).data,
                "completed": r.status == "completed",
            }
        )

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        r = self._own_recipient(request, pk)
        a = self.get_object()
        answers = request.data.get("answers") or {}
        questions = list(a.questions.all())
        for q in questions:
            val = answers.get(str(q.id))
            if q.required and (val is None or val == "" or val == []):
                raise ValidationError({"answers": f"'{q.text}' is required."})
        for q in questions:
            if str(q.id) in answers:
                AssignmentResponse.objects.update_or_create(
                    recipient=r,
                    question=q,
                    defaults={
                        "org_id": request.user.org_id,
                        "answer": {"value": answers[str(q.id)]},
                    },
                )
        engine.complete(r, ip=request.META.get("REMOTE_ADDR", ""), note="")
        return Response(RecipientSerializer(r).data)

    @action(detail=True, methods=["get"], url_path="responses")
    def responses(self, request, pk=None):
        a = self.get_object()
        out = []
        for q in a.questions.all():
            resp = list(AssignmentResponse.objects.filter(question=q))
            if q.qtype in ("single_choice", "multi_choice"):
                counts = {opt: 0 for opt in q.options}
                for r in resp:
                    val = (r.answer or {}).get("value")
                    for v in val if isinstance(val, list) else [val]:
                        if v in counts:
                            counts[v] += 1
                out.append(
                    {
                        "id": str(q.id),
                        "text": q.text,
                        "qtype": q.qtype,
                        "counts": counts,
                        "total": len(resp),
                    }
                )
            else:
                out.append(
                    {
                        "id": str(q.id),
                        "text": q.text,
                        "qtype": q.qtype,
                        "answers": [(r.answer or {}).get("value") for r in resp],
                    }
                )
        return Response(out)
