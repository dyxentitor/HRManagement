"""Celery app -- autodiscovers tasks from each module."""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.dev")

app = Celery("hrms_api")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Email digest cadence. Default 3600 (hourly) matches existing prod behaviour;
# dev can dial it down via EMAIL_DIGEST_INTERVAL_SECONDS in .env to observe
# approval emails within a single QA loop (the v1.10.0 sweep flagged the
# hourly delay as Bug #3 because Playwright didn't wait long enough).
_EMAIL_DIGEST_INTERVAL = float(os.environ.get("EMAIL_DIGEST_INTERVAL_SECONDS", "3600"))

app.conf.beat_schedule = {
    **getattr(app.conf, "beat_schedule", {}),
    "send-pending-email-digests": {
        "task": "modules.notification.tasks.send_pending_email_digests",
        "schedule": _EMAIL_DIGEST_INTERVAL,
    },
    "publish-scheduled-announcements": {
        # Every 10 min: publish announcements whose scheduled_at has arrived.
        "task": "modules.announcements.tasks.publish_scheduled_announcements",
        "schedule": crontab(minute="*/10"),
    },
    "detect-certification-expiry": {
        # Nightly at 02:00 — flags certs expiring in 30/60/90 days,
        # auto-expires past-due rows, and sends reminder notifications.
        "task": "modules.certification.tasks.detect_certification_expiry",
        "schedule": crontab(hour=2, minute=0),
    },
    "detect-training-overdue": {
        # Nightly at 02:15 — marks training assignments past their due_date as overdue.
        "task": "modules.certification.tasks.detect_training_overdue",
        "schedule": crontab(hour=2, minute=15),
    },
    "leave-year-rollover": {
        # Jan 1 01:00 KL: per-org carry-forward(year-1) then year-start(year).
        # Both jobs are idempotent on UUID5 keys.
        "task": "modules.leave.tasks.year_rollover",
        "schedule": crontab(minute=0, hour=1, day_of_month=1, month_of_year=1),
    },
    "leave-carry-forward-expiry": {
        # Daily 02:30 KL: debits unused carried_forward at expiry date.
        "task": "modules.leave.tasks.carry_forward_expiry_sweep",
        "schedule": crontab(hour=2, minute=30),
    },
    "assignment-reminders": {
        # Daily 02:45 KL: reminders for assignments due tomorrow + overdue notices.
        "task": "modules.assignments.tasks.assignment_reminders",
        "schedule": crontab(hour=2, minute=45),
    },
    "assignment-recurrence": {
        # Daily 03:00 KL: spawn the next occurrence of due recurring templates.
        "task": "modules.assignments.tasks.spawn_recurring_assignments",
        "schedule": crontab(hour=3, minute=0),
    },
    "verify-payroll-ledger": {
        # Daily 03:15 KL: verify the payroll hash-chain; logs an error (→ Sentry)
        # if the chain is broken, so tampering is caught within a day.
        "task": "common.audit.tasks.verify_payroll_ledger",
        "schedule": crontab(hour=3, minute=15),
    },
}
