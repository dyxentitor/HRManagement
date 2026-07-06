"""Announcement viewset — reader feed, detail, read-tracking, authoring."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import Announcement, AnnouncementAttachment, AnnouncementRead
from .serializers import AnnouncementSerializer, AnnouncementWriteSerializer
from .services.attachment import AttachmentService
from .services.audience import user_in_audience
from .services.publish import archive, publish

_READ_ACTIONS = frozenset(
    {"retrieve", "feed", "unread_count", "mark_read", "read_all", "attachment_download"}
)


class AnnouncementViewSet(viewsets.ModelViewSet):
    """Company announcements: manage (write) + reader feed/detail/read-tracking (read)."""

    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in _READ_ACTIONS:
            return ["announcement:read"]
        return ["announcement:write"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AnnouncementWriteSerializer
        return AnnouncementSerializer

    def get_queryset(self):
        qs = Announcement.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True
        )
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs.order_by("-pinned", "-published_at", "-created_at")

    def perform_create(self, serializer):
        publish_now = serializer.validated_data.pop("publish_now", False)
        scheduled_at = serializer.validated_data.get("scheduled_at")
        ann = serializer.save(
            org_id=self.request.user.org_id, created_by=self.request.user.id
        )
        if publish_now:
            publish(ann, actor_id=self.request.user.id)
        elif scheduled_at:
            ann.status = "scheduled"
            ann.save(update_fields=["status", "updated_at"])

    def perform_update(self, serializer):
        serializer.validated_data.pop("publish_now", None)
        serializer.save()

    # ---- reader feed -------------------------------------------------------

    def _feed_items(self, request) -> list:
        now = timezone.now()
        qs = (
            Announcement.all_objects.filter(
                org_id=request.user.org_id, deleted_at__isnull=True, status="published"
            )
            .filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now))
            .order_by("-pinned", "-published_at")
        )
        items = [a for a in qs if user_in_audience(request.user, a)]
        cat = request.query_params.get("category")
        pri = request.query_params.get("priority")
        pinned = request.query_params.get("pinned")
        search = request.query_params.get("search")
        if cat:
            items = [a for a in items if a.category == cat]
        if pri:
            items = [a for a in items if a.priority == pri]
        if pinned == "true":
            items = [a for a in items if a.pinned]
        if search:
            s = search.lower()
            items = [a for a in items if s in a.title.lower() or s in a.body.lower()]
        return items

    def _read_ids(self, request, items) -> set:
        return set(
            AnnouncementRead.objects.filter(
                user_id=request.user.id, announcement__in=[a.id for a in items]
            ).values_list("announcement_id", flat=True)
        )

    @action(detail=False, methods=["get"], url_path="feed")
    def feed(self, request):
        items = self._feed_items(request)
        read_ids = self._read_ids(request, items)
        if request.query_params.get("unread_only") == "true":
            items = [a for a in items if a.id not in read_ids]
        ser = AnnouncementSerializer(
            items, many=True, context={"request": request, "read_ids": read_ids}
        )
        return Response(ser.data)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        items = self._feed_items(request)
        read_ids = self._read_ids(request, items)
        count = sum(1 for a in items if a.id not in read_ids)
        return Response({"count": count})

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        ann = self.get_object()
        AnnouncementRead.objects.get_or_create(
            announcement=ann, user_id=request.user.id, defaults={"org_id": request.user.org_id}
        )
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        items = self._feed_items(request)
        read_ids = self._read_ids(request, items)
        AnnouncementRead.objects.bulk_create(
            [
                AnnouncementRead(
                    org_id=request.user.org_id,
                    announcement_id=a.id,
                    user_id=request.user.id,
                )
                for a in items
                if a.id not in read_ids
            ]
        )
        return Response({"ok": True})

    # ---- lifecycle actions -------------------------------------------------

    @action(detail=True, methods=["post"], url_path="publish")
    def publish_action(self, request, pk=None):
        ann = publish(self.get_object(), actor_id=request.user.id)
        return Response(AnnouncementSerializer(ann, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive_action(self, request, pk=None):
        ann = archive(self.get_object())
        return Response(AnnouncementSerializer(ann, context={"request": request}).data)

    # ---- attachments -------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="attachments/presigned-upload")
    def attachment_presign(self, request, pk=None):
        ann = self.get_object()
        filename = request.data.get("filename")
        content_type = request.data.get("content_type")
        if not filename or not content_type:
            raise ValidationError({"detail": "filename and content_type are required."})
        return Response(
            AttachmentService.presigned_upload(
                announcement=ann, filename=filename, content_type=content_type
            )
        )

    @action(detail=True, methods=["post"], url_path="attachments")
    def register_attachment(self, request, pk=None):
        ann = self.get_object()
        try:
            att = AttachmentService.register(
                announcement=ann,
                filename=request.data["filename"],
                content_type=request.data["content_type"],
                size_bytes=int(request.data["size_bytes"]),
                s3_key=request.data["s3_key"],
                uploaded_by=request.user.id,
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            {"id": att.id, "filename": att.filename, "size_bytes": att.size_bytes}
        )

    @action(detail=True, methods=["get"], url_path=r"attachments/(?P<aid>[^/.]+)/download")
    def attachment_download(self, request, pk=None, aid=None):
        ann = self.get_object()
        att = AnnouncementAttachment.objects.filter(announcement=ann, id=aid).first()
        if att is None:
            raise ValidationError({"detail": "Attachment not found."})
        return Response({"url": AttachmentService.presigned_get(attachment=att)})

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<aid>[^/.]+)")
    def attachment_delete(self, request, pk=None, aid=None):
        ann = self.get_object()
        att = AnnouncementAttachment.objects.filter(announcement=ann, id=aid).first()
        if att is not None:
            AttachmentService.delete(attachment=att)
        return Response(status=204)
