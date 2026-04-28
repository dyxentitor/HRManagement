"""Async export task."""

from __future__ import annotations

import os
import uuid

import boto3
from botocore.config import Config
from celery import shared_task
from django.utils import timezone


def _s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


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
        _s3().put_object(
            Bucket=os.environ.get("S3_BUCKET", "hrms"),
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
