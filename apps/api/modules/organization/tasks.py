"""Celery tasks for the organization module."""

from __future__ import annotations

from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_org_logo(self, org_id: str, raw_s3_key: str) -> str:
    """STUB until Task 4 — full Pillow resize implementation lands next commit."""
    return raw_s3_key
