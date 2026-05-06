"""Celery tasks for the employee module."""

from __future__ import annotations

from celery import shared_task


@shared_task(bind=True, max_retries=3)
def process_avatar_upload(self, employee_id: str, original_s3_key: str) -> None:
    """Implemented in v1.7.0 Task 3."""
    return None
