"""Incentive module endpoints — customers/pools, projects, claims, payouts, bonds.

Authorization: coarse perms via HRMSPermission.required_perms, plus row-level checks (a manager acts
only on their own projects; an employee sees only own claims + visible projects). Management
(`incentive:admin`) may amend anything; money amendments go through the append-only ledger engine.
"""

from __future__ import annotations

import logging
from typing import ClassVar

from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .models import Claim, Customer, EmployeeBond, Project
from .serializers import BondSerializer, ClaimSerializer, CustomerSerializer, ProjectSerializer
from .services import ledger
from .services.overview import build_overview

OVERVIEW_PERMS = {"incentive:admin", "incentive:project:write"}

_log = logging.getLogger(__name__)


def _audit(request, action, entity, entity_id, *, before=None, after=None):
    """Write a Tier-1 audit row for incentive customer CUD operations."""
    from common.audit.service import append

    append(
        org_id=request.user.org_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview_view(request):
    """GET /api/v1/incentive/overview/ — the command-center aggregation (managers + admin)."""
    if not (OVERVIEW_PERMS & set(get_user_perms(request.user))):
        return Response({"detail": "Permission denied"}, status=drf_status.HTTP_403_FORBIDDEN)
    return Response(build_overview(request.user.org_id))

ADMIN = "incentive:admin"
PROJECT_WRITE = "incentive:project:write"
CLAIM = "incentive:claim"


def _employee(request):
    return Employee.all_objects.filter(
        user_id=request.user.id, org_id=request.user.org_id, deleted_at__isnull=True
    ).first()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    """GET /api/v1/incentive/me/ — the employee 'My Mandays' summary (any incentive user)."""
    if CLAIM not in set(get_user_perms(request.user)):
        return Response({"detail": "Permission denied"}, status=drf_status.HTTP_403_FORBIDDEN)
    from .services.me import build_me_summary

    return Response(build_me_summary(_employee(request), request.user.org_id))


@requires_feature("incentive")
class CustomerViewSet(viewsets.ModelViewSet):
    """Customers + their manday pools. Management-only."""

    serializer_class = CustomerSerializer
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = [ADMIN]

    def get_queryset(self):
        qs = Customer.objects.filter(org_id=self.request.user.org_id).order_by("name")
        # Always include all rows for detail actions so admins can retrieve/update inactive
        # customers (e.g. PATCH is_active=True to reactivate). For list, filter by is_active
        # unless the caller explicitly opts in.
        if self.action in ("retrieve", "update", "partial_update", "destroy"):
            return qs
        if self.request.query_params.get("include_inactive") not in ("1", "true"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(org_id=self.request.user.org_id, created_by=self.request.user.id)
        _audit(
            self.request,
            "incentive.customer.created",
            "incentive_customer",
            obj.id,
            after={"name": obj.name},
        )

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in serializer.validated_data}
        was_active = serializer.instance.is_active
        obj = serializer.save()
        action = (
            "incentive.customer.reactivated"
            if not was_active and obj.is_active
            else "incentive.customer.updated"
        )
        _audit(
            self.request,
            action,
            "incentive_customer",
            obj.id,
            before={k: str(v) for k, v in before.items()},
            after={k: str(getattr(obj, k)) for k in before},
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        _audit(
            self.request,
            "incentive.customer.deactivated",
            "incentive_customer",
            instance.id,
            after={"name": instance.name, "is_active": False},
        )

    @action(detail=True, methods=["post"])
    def top_up(self, request, pk=None):
        customer = self.get_object()
        mandays = request.data.get("mandays")
        if mandays is None:
            raise ValidationError("mandays is required.")
        ledger.top_up(
            customer, mandays, actor_id=request.user.id, note=request.data.get("note", "")
        )
        return Response(CustomerSerializer(customer).data)


@requires_feature("incentive")
class ProjectViewSet(viewsets.ModelViewSet):
    """Projects under a customer. Managers open/manage; SOC visibility enforced server-side."""

    serializer_class = ProjectSerializer
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return []  # custom check in _gate_write
        return []  # read: any incentive user; queryset filters by visibility

    def _gate_write(self):
        perms = get_user_perms(self.request.user)
        if ADMIN in perms or PROJECT_WRITE in perms:
            return
        raise PermissionDenied("You can't manage incentive projects.")

    def get_queryset(self):
        qs = Project.objects.filter(org_id=self.request.user.org_id).order_by("-created_at")
        perms = get_user_perms(self.request.user)
        if ADMIN in perms or PROJECT_WRITE in perms:
            return qs
        # Contributors: hide SOC-only projects from SOC employees.
        emp = _employee(self.request)
        if emp and ledger.is_soc(emp):
            return qs.filter(include_soc=True)
        return qs

    def perform_create(self, serializer):
        self._gate_write()
        emp = _employee(self.request)
        serializer.save(
            org_id=self.request.user.org_id,
            manager_id=emp.id if emp else None,
            created_by=self.request.user.id,
        )

    def perform_update(self, serializer):
        self._gate_write()
        serializer.save()

    def perform_destroy(self, instance):
        self._gate_write()
        instance.status = "closed"
        instance.save(update_fields=["status", "updated_at"])


@requires_feature("incentive")
class ClaimViewSet(viewsets.ModelViewSet):
    """Manday claims. Employees submit; managers approve/reject; management reverses/amends."""

    serializer_class = ClaimSerializer
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action == "create":
            return [CLAIM]
        return []  # list/retrieve: own rows; actions: custom-checked

    def get_queryset(self):
        qs = Claim.objects.filter(org_id=self.request.user.org_id).order_by("-created_at")
        perms = get_user_perms(self.request.user)
        if ADMIN in perms:
            return qs
        emp = _employee(self.request)
        emp_id = emp.id if emp else None
        if PROJECT_WRITE in perms:
            # managers see claims on projects they own + their own claims
            owned = Project.objects.filter(
                org_id=self.request.user.org_id, manager_id=emp_id
            ).values_list("id", flat=True)
            return (
                qs.filter(project_id__in=list(owned)) | qs.filter(employee_id=emp_id)
            ).distinct()
        return qs.filter(employee_id=emp_id)

    def perform_create(self, serializer):
        emp = _employee(self.request)
        if emp is None:
            raise PermissionDenied("No employee record.")
        project = serializer.validated_data["project"]
        if not ledger.can_see_project(emp, project):
            raise PermissionDenied("This project is not visible to you.")
        if not ledger.eligible(emp.id, self.request.user.org_id):
            raise ValidationError("You are not eligible to claim (no active mandays bond).")
        claim = serializer.save(
            org_id=self.request.user.org_id, employee_id=emp.id, created_by=self.request.user.id
        )
        # Notify the project manager (approver) of the new claim (best-effort).
        try:
            from modules.employee.models import Employee
            from modules.notification.services.notify import notify

            mgr = (
                Employee.all_objects.filter(
                    id=project.manager_id, org_id=self.request.user.org_id
                ).first()
                if project.manager_id
                else None
            )
            approver = getattr(mgr, "user", None) if mgr else None
            if approver is not None:
                notify(
                    user=approver,
                    type="incentive.claim_submitted",
                    payload={
                        "claim_id": str(claim.id),
                        "project": project.name,
                        "mandays": str(claim.mandays),
                    },
                    deep_link="/incentive",
                    priority="high",
                )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to send incentive.claim_submitted notification"
            )

    def update(self, request, *args, **kwargs):
        """Owner edits their own claim while it is still pending (mandays / note / project)."""
        claim = self.get_object()
        emp = _employee(request)
        if not (emp and claim.employee_id == emp.id):
            raise PermissionDenied("You can only edit your own claim.")
        if claim.status != "pending":
            raise ValidationError("Only a pending claim can be edited.")
        new_project = request.data.get("project")
        if new_project and str(new_project) != str(claim.project_id):
            proj = Project.objects.filter(
                org_id=request.user.org_id, id=new_project
            ).first()
            if proj is None or not ledger.can_see_project(emp, proj):
                raise PermissionDenied("This project is not visible to you.")
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Employee withdraws their own pending claim. Mints no ledger row (nothing was booked)."""
        claim = self.get_object()
        emp = _employee(request)
        if not (emp and claim.employee_id == emp.id):
            raise PermissionDenied("You can only cancel your own claim.")
        if claim.status != "pending":
            raise ValidationError("Only a pending claim can be cancelled.")
        claim.status = "cancelled"
        claim.save(update_fields=["status", "updated_at"])
        return Response(ClaimSerializer(claim).data)

    def _can_review(self, claim) -> bool:
        perms = get_user_perms(self.request.user)
        if ADMIN in perms:
            return True
        if PROJECT_WRITE in perms:
            emp = _employee(self.request)
            return bool(emp and claim.project.manager_id == emp.id)
        return False

    def _notify_claimant(self, claim, notif_type: str, reason: str = "") -> None:
        """Best-effort in-app notification to the claimant — never breaks the review."""
        try:
            from modules.notification.services.notify import notify

            emp = Employee.all_objects.filter(id=claim.employee_id, org_id=claim.org_id).first()
            user = getattr(emp, "user", None) if emp else None
            if user is None:
                return
            notify(
                user=user,
                type=notif_type,
                payload={
                    "claim_id": str(claim.id),
                    "project": claim.project.name,
                    "mandays": str(claim.mandays),
                    "reason": reason,
                },
                deep_link="/incentive",
            )
        except Exception:
            _log.exception("incentive notify %s failed for claim %s", notif_type, claim.id)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        claim = self.get_object()
        if not self._can_review(claim):
            raise PermissionDenied("You can't review this claim.")
        ledger.approve_claim(claim, actor_id=request.user.id)
        claim.refresh_from_db()
        self._notify_claimant(claim, "incentive.claim_approved")
        return Response(ClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        claim = self.get_object()
        if not self._can_review(claim):
            raise PermissionDenied("You can't review this claim.")
        reason = request.data.get("reason", "")
        ledger.reject_claim(claim, actor_id=request.user.id, reason=reason)
        claim.refresh_from_db()
        self._notify_claimant(claim, "incentive.claim_rejected", reason=reason)
        return Response(ClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        if ADMIN not in get_user_perms(request.user):
            raise PermissionDenied("Only management can reverse an approved claim.")
        claim = self.get_object()
        ledger.reverse_claim(claim, actor_id=request.user.id, reason=request.data.get("reason", ""))
        claim.refresh_from_db()
        return Response(ClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def set_payout(self, request, pk=None):
        """Walk an approved claim's payout Pending -> Approved -> Paid (admin; no money effect)."""
        if ADMIN not in get_user_perms(request.user):
            raise PermissionDenied("Only management manages payouts.")
        claim = self.get_object()
        new = request.data.get("payout_status")
        if claim.status != "approved" or new not in {"pending", "approved", "paid"}:
            raise ValidationError("Invalid payout transition.")
        claim.payout_status = new
        claim.save(update_fields=["payout_status", "updated_at"])
        return Response(ClaimSerializer(claim).data)


@requires_feature("incentive")
class BondViewSet(viewsets.ModelViewSet):
    """Per-employee mandays bonds. Management creates/manages; an employee accepts their own."""

    serializer_class = BondSerializer
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [ADMIN]
        return []  # list/retrieve own; accept own

    def get_queryset(self):
        qs = EmployeeBond.objects.filter(org_id=self.request.user.org_id)
        if ADMIN in get_user_perms(self.request.user):
            return qs
        emp = _employee(self.request)
        return qs.filter(employee_id=emp.id if emp else None)

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id, created_by=self.request.user.id)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        from django.utils import timezone

        bond = self.get_object()
        emp = _employee(request)
        if not (emp and bond.employee_id == emp.id) and ADMIN not in get_user_perms(request.user):
            raise PermissionDenied("You can only accept your own bond.")
        if bond.accepted_at is None:
            bond.accepted_at = timezone.now()
            bond.save(update_fields=["accepted_at", "updated_at"])
        return Response(BondSerializer(bond).data)
