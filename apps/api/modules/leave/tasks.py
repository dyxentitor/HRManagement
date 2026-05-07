"""Celery beat tasks for v1.8.0 leave accrual + carry-forward + expiry."""

from __future__ import annotations

import datetime
import logging

from celery import shared_task

from modules.leave.services.accrual import (
    run_carry_forward_expiry,
    run_year_end_carry_forward,
    run_year_start_accrual,
)
from modules.organization.models import Organization

log = logging.getLogger(__name__)


@shared_task(name="modules.leave.tasks.year_rollover")
def year_rollover() -> dict:
    """Jan 1 01:00 KL: for every active org, run carry-forward(year-1) then year-start(year).

    Both jobs are idempotent on UUID5 keys, so this is safe to run multiple times.
    """
    today = datetime.date.today()
    year = today.year
    summary: dict = {}
    for org in Organization.objects.filter(deleted_at__isnull=True):
        carry = run_year_end_carry_forward(org_id=org.id, year=year - 1)
        accr = run_year_start_accrual(org_id=org.id, year=year)
        summary[str(org.id)] = {"carry": carry, "accrue": accr}
        log.info("year_rollover org=%s carry=%s accrue=%s", org.slug, carry, accr)
    return summary


@shared_task(name="modules.leave.tasks.carry_forward_expiry_sweep")
def carry_forward_expiry_sweep() -> dict:
    today = datetime.date.today()
    result = run_carry_forward_expiry(today=today)
    log.info("carry_forward_expiry_sweep today=%s result=%s", today, result)
    return result
