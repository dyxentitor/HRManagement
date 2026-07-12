"""FeedbackViewSet — create / list (scope) / retrieve / partial_update."""

from __future__ import annotations

import logging
from typing import ClassVar

from django.db import transaction
from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from common.audit.service import append as audit_append
from common.feature_flags.decorators import requires_feature
from modules.identity.models import User
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .models import Feedback, FeedbackNote
from .serializers import (
    FeedbackAdminSerializer,
    FeedbackAttachmentSerializer,
    FeedbackCreateSerializer,
    FeedbackNoteSerializer,
    FeedbackNoteWriteSerializer,
    FeedbackSerializer,
    FeedbackUpdateSerializer,
    PresignedUploadSerializer,
    RegisterAttachmentSerializer,
)
from .services.attachment import FeedbackAttachmentService

logger = logging.getLogger(__name__)


@requires_feature("feedback")
class FeedbackViewSet(viewsets.ModelViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]
    http_method_names: ClassVar[list[str]] = ["get", "post", "patch", "delete", "head", "options"]

    # ------------------------------------------------------------------
    # Permission helpers
    # ------------------------------------------------------------------

    def _can_manage(self) -> bool:
        return "feedback:manage:org" in get_user_perms(self.request.user)

    def get_required_perms(self) -> list[str]:
        if self.action == "create":
            return ["feedback:submit:self"]
        if self.action == "list":
            if self.request.query_params.get("scope") == "org":
                return ["feedback:manage:org"]
            return ["feedback:read:self"]
        if self.action in ("partial_update", "update"):
            return ["feedback:manage:org"]
        if self.action == "destroy":
            return ["feedback:manage:org"]
        # retrieve: object-level check inside get_object
        return []

    @property
    def required_perms(self) -> list[str]:
        return self.get_required_perms()

    # ------------------------------------------------------------------
    # Queryset / serializer selection
    # ------------------------------------------------------------------

    def get_queryset(self):
        qs = Feedback.objects.filter(org_id=self.request.user.org_id)
        if self.action == "list" and self.request.query_params.get("scope") == "org":
            for field in ("status", "category"):
                val = self.request.query_params.get(field)
                if val:
                    qs = qs.filter(**{field: val})
            assignee = self.request.query_params.get("assignee")
            if assignee:
                qs = qs.filter(assignee_id=assignee)
            q = self.request.query_params.get("q")
            if q:
                qs = qs.filter(title__icontains=q)
            return qs.order_by("-created_at")
        return qs.filter(reporter=self.request.user).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return FeedbackCreateSerializer
        if self.action in ("partial_update", "update"):
            return FeedbackUpdateSerializer
        if self._can_manage():
            return FeedbackAdminSerializer
        return FeedbackSerializer

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        instance = Feedback.objects.create(
            org_id=request.user.org_id,
            reporter=request.user,
            **ser.validated_data,
        )
        return Response({"id": str(instance.id)}, status=drf_status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # Object retrieval with data-scope guard
    # ------------------------------------------------------------------

    def get_object(self):
        obj = Feedback.objects.filter(
            org_id=self.request.user.org_id,
            pk=self.kwargs["pk"],
        ).first()
        if obj is None:
            raise PermissionDenied()
        if obj.reporter_id != self.request.user.id and not self._can_manage():
            raise PermissionDenied()
        return obj

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        return Response(self.get_serializer(obj).data)

    # ------------------------------------------------------------------
    # Partial update (manage:org only)
    # ------------------------------------------------------------------

    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        ser = FeedbackUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        validated = ser.validated_data

        with transaction.atomic():
            if "status" in validated and validated["status"] != obj.status:
                old_status = obj.status
                obj.status = validated["status"]
                obj.save(update_fields=["status", "updated_at"])
                audit_append(
                    org_id=obj.org_id,
                    action="feedback.status.changed",
                    entity="feedback",
                    entity_id=obj.id,
                    before={"status": old_status},
                    after={"status": obj.status},
                    actor_id=request.user.id,
                )
                try:
                    from modules.notification.services.notify import notify

                    notify(
                        user=obj.reporter,
                        type="feedback.status_changed",
                        payload={"feedback_id": str(obj.id)},
                        deep_link="/feedback",
                        priority="normal",
                    )
                except Exception:
                    logger.exception("feedback notify failed for feedback_id=%s", obj.id)

            if "assignee_id" in validated:
                aid = validated["assignee_id"]
                if aid is not None:
                    assignee = User.objects.filter(id=aid, org_id=obj.org_id).first()
                    if assignee is None or "feedback:manage:org" not in get_user_perms(assignee):
                        raise ValidationError({"assignee_id": "Must be an admin in this org."})
                old_assignee = str(obj.assignee_id)
                obj.assignee_id = aid
                obj.save(update_fields=["assignee_id", "updated_at"])
                audit_append(
                    org_id=obj.org_id,
                    action="feedback.assigned",
                    entity="feedback",
                    entity_id=obj.id,
                    before={"assignee": old_assignee},
                    after={"assignee": str(aid)},
                    actor_id=request.user.id,
                )

        return Response(FeedbackAdminSerializer(obj).data)

    # ------------------------------------------------------------------
    # Destroy (org_admin only, resolved/closed status required)
    # ------------------------------------------------------------------

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if not self._can_manage():
            raise PermissionDenied()
        if obj.status not in ("resolved", "closed"):
            raise ValidationError({"status": "Only resolved or closed feedback can be deleted."})
        for att in obj.attachments.all():
            FeedbackAttachmentService.delete(att)
        audit_append(
            org_id=obj.org_id,
            action="feedback.deleted",
            entity="feedback",
            entity_id=obj.id,
            before={"status": obj.status, "title": obj.title},
            actor_id=request.user.id,
        )
        obj.hard_delete()
        return Response(status=drf_status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Notes (manage-only)
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="notes")
    def notes(self, request, pk=None):
        obj = self.get_object()
        if not self._can_manage():
            raise PermissionDenied()
        if request.method == "POST":
            ser = FeedbackNoteWriteSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            note = FeedbackNote.objects.create(
                feedback=obj,
                author_id=request.user.id,
                body=ser.validated_data["body"],
            )
            return Response(FeedbackNoteSerializer(note).data, status=drf_status.HTTP_201_CREATED)
        return Response(FeedbackNoteSerializer(obj.notes.order_by("created_at"), many=True).data)

    # ------------------------------------------------------------------
    # Attachments — presigned upload / register / list / download
    # ------------------------------------------------------------------

    @action(
        detail=True,
        methods=["post"],
        url_path="attachments/presigned-upload",
    )
    def presigned_upload(self, request, pk=None):
        obj = self.get_object()
        ser = PresignedUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = FeedbackAttachmentService.presigned_upload(
            feedback=obj,
            filename=ser.validated_data["filename"],
            content_type=ser.validated_data["content_type"],
        )
        return Response(result)

    @action(detail=True, methods=["post", "get"], url_path="attachments")
    def attachments(self, request, pk=None):
        obj = self.get_object()
        if request.method == "GET":
            return Response(FeedbackAttachmentSerializer(obj.attachments.all(), many=True).data)
        # POST: register a new attachment after S3 PUT
        ser = RegisterAttachmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        att = FeedbackAttachmentService.register(
            feedback=obj,
            filename=ser.validated_data["filename"],
            content_type=ser.validated_data["content_type"],
            size_bytes=ser.validated_data["size_bytes"],
            s3_key=ser.validated_data["s3_key"],
            uploaded_by=request.user.id,
        )
        return Response(FeedbackAttachmentSerializer(att).data, status=drf_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)/download",
    )
    def download_attachment(self, request, pk=None, attachment_id=None):
        """Return a short-lived presigned URL to view/download one attachment."""
        obj = self.get_object()
        att = obj.attachments.filter(id=attachment_id).first()
        if att is None:
            raise NotFound("Attachment not found.")
        return Response(FeedbackAttachmentService.download_url(attachment=att))
