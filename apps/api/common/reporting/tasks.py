"""Async export task."""

from __future__ import annotations

import uuid

from celery import shared_task
from django.utils import timezone

from common.storage.s3 import bucket, internal_s3_client


@shared_task
def run_export(job_id: int):
    """Run a report export job: query -> render -> upload to S3 -> update job row."""
    from .exporters import get_exporter
    from .models import ReportExportJob
    from .registry import REGISTRY

    job = ReportExportJob.objects.get(id=job_id)
    job.status = "running"
    job.save(update_fields=["status"])

    try:
        cls = REGISTRY.get(job.report_code)
        if cls is None:
            raise ValueError(f"Unknown report: {job.report_code}")

        rows_qs = cls.queryset(filters=job.filters, user=job.user)
        rows = [cls.serialize_row(r) for r in rows_qs]

        exporter = get_exporter(job.format)
        content = exporter.render(title=cls.title, columns=cls.columns, rows=rows)

        s3_key = f"reports/{job.org_id}/{job.report_code}/{uuid.uuid4()}.{job.format}"
        internal_s3_client().put_object(
            Bucket=bucket(),
            Key=s3_key,
            Body=content,
            ContentType=exporter.content_type,
        )

        job.s3_key = s3_key
        job.status = "done"
        job.completed_at = timezone.now()
        job.save(update_fields=["s3_key", "status", "completed_at"])
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)[:1000]
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        raise
