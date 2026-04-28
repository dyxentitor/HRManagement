"""Celery app -- autodiscovers tasks from each module."""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.dev")

app = Celery("hrms_api")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    **getattr(app.conf, "beat_schedule", {}),
    "send-pending-email-digests": {
        "task": "modules.notification.tasks.send_pending_email_digests",
        "schedule": 3600.0,  # hourly
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
}
