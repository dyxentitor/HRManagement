"""Celery tasks for certification + training."""

from celery import shared_task


@shared_task
def detect_certification_expiry():
    from .services.expiry_scan import scan_certification_expiry

    return scan_certification_expiry()


@shared_task
def detect_training_overdue():
    """Mark assignments past due_date as overdue."""

    from django.utils import timezone

    from .models import TrainingAssignment

    today = timezone.localdate()
    n = TrainingAssignment.all_objects.filter(
        deleted_at__isnull=True,
        status__in=("assigned", "in_progress"),
        due_date__lt=today,
    ).update(status="overdue")
    return {"marked_overdue": n}
