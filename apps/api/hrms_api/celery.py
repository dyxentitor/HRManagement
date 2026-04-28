"""Celery app -- autodiscovers tasks from each module."""

import os

from celery import Celery

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
}
