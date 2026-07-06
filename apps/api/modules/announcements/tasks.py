"""Celery tasks for announcements."""

from __future__ import annotations

from celery import shared_task
from django.utils import timezone

from .models import Announcement
from .services.publish import publish


@shared_task
def publish_scheduled_announcements() -> int:
    """Publish announcements whose scheduled_at has arrived. Returns count published."""
    due = Announcement.all_objects.filter(
        status="scheduled",
        scheduled_at__lte=timezone.now(),
        deleted_at__isnull=True,
    )
    n = 0
    for ann in due:
        publish(ann)
        n += 1
    return n
