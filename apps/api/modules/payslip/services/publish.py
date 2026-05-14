"""Publish a validated PayrollRun: generate PDFs, write ledger rows, mark sent."""

from __future__ import annotations

import uuid

from django.db import transaction
from django.utils import timezone

from common.audit import append, append_payroll
from common.storage.s3 import bucket as _bucket
from common.storage.s3 import internal_s3_client
from modules.employee.models import Employee
from modules.organization.models import Organization

from ..models import PayrollRun, PayslipRecord
from .pdf_render import render_payslip_pdf


def _s3():
    """Back-compat shim — kept so existing tests can patch this name."""
    return internal_s3_client()


def publish_run(*, run: PayrollRun, actor_id: uuid.UUID) -> int:
    """Publish all validated payslips in a run.

    For each PayslipRecord with status='draft' in the run's period:
      1. Render PDF
      2. Upload to S3
      3. Update payslip: status='published', pdf_s3_key, pdf_generated_at, published_at
      4. Append audit_log + payroll_audit_ledger entries

    Returns the number of payslips published.
    """
    if run.status not in ("draft", "validated"):
        from common.workflow.exceptions import InvalidTransition

        raise InvalidTransition(f"Cannot publish run with status='{run.status}'")
    if run.period.status == "published":
        from common.workflow.exceptions import InvalidTransition

        raise InvalidTransition(f"Period {run.period_id} is already published")

    org = Organization.objects.get(id=run.org_id)
    s3 = _s3()
    bucket = _bucket()
    n_published = 0

    payslips = PayslipRecord.all_objects.filter(
        period=run.period,
        status="draft",
        deleted_at__isnull=True,
    )
    with transaction.atomic():
        for ps in payslips:
            emp = Employee.all_objects.get(id=ps.employee_id)
            pdf_bytes = render_payslip_pdf(payslip=ps, employee=emp, org=org)

            key = f"payslips/{org.slug}/{ps.period.period_start}/{emp.employee_code}.pdf"
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=pdf_bytes,
                ContentType="application/pdf",
            )

            ps.pdf_s3_key = key
            ps.pdf_generated_at = timezone.now()
            ps.status = "published"
            ps.published_at = timezone.now()
            ps.save(
                update_fields=[
                    "pdf_s3_key",
                    "pdf_generated_at",
                    "status",
                    "published_at",
                    "updated_at",
                ]
            )

            append(
                org_id=run.org_id,
                action="payslip.publish",
                entity="payslips",
                entity_id=ps.id,
                before=None,
                after={
                    "employee_code": emp.employee_code,
                    "period": str(ps.period.period_start),
                    "gross": str(ps.gross),
                    "net": str(ps.net),
                },
                actor_id=actor_id,
            )
            append_payroll(
                org_id=run.org_id,
                action="payslip.publish",
                entity="payslips",
                entity_id=ps.id,
                payload={
                    "employee_code": emp.employee_code,
                    "period_start": str(ps.period.period_start),
                    "period_end": str(ps.period.period_end),
                    "gross": str(ps.gross),
                    "net": str(ps.net),
                    "currency": ps.currency_code,
                },
                actor_id=actor_id,
            )
            n_published += 1

        run.status = "published"
        run.published_at = timezone.now()
        run.save(update_fields=["status", "published_at", "updated_at"])

        run.period.status = "published"
        run.period.save(update_fields=["status", "updated_at"])

    return n_published
