"""Scheduled integrity checks for the append-only ledgers."""

from __future__ import annotations

import logging

from celery import shared_task

from common.audit.service import verify_payroll_chain

_log = logging.getLogger(__name__)


@shared_task(name="common.audit.tasks.verify_payroll_ledger")
def verify_payroll_ledger() -> dict:
    """Recompute the payroll hash-chain from genesis. On a break, log an error
    (captured by Sentry / the monitoring pipeline) so tampering or corruption is
    caught within a day instead of at the next manual quarterly check."""
    ok, broken_seq = verify_payroll_chain()
    if not ok:
        _log.error("Payroll ledger hash-chain verification FAILED at seq=%s", broken_seq)
    return {"ok": ok, "broken_seq": broken_seq}
