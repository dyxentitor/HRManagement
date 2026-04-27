# HRMS M8 — Certification + Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track employee certifications with 90/60/30-day expiry reminders (idempotent — daily cron re-runs don't double-notify). Training plans with assignments and progress; auto-overdue when past `due_date`. Document uploads via S3 presigned URLs.

**Branch:** create `m8/certification` from master.

---

## File structure

```
apps/api/modules/certification/                NEW
├── __init__.py, apps.py, models.py, admin.py
├── services/
│   ├── __init__.py
│   ├── certification.py
│   ├── training.py
│   └── expiry_scan.py                          90/60/30-day window detector
├── tasks.py                                    Celery tasks: detect_expiry, detect_overdue
├── serializers.py, views.py, urls.py
├── migrations/
└── tests/

apps/web/src/modules/certification/            NEW
├── api.ts, routes.tsx
└── pages/{MyCertificationsPage, MyTrainingPage, AdminCertPage}.tsx

apps/api/modules/identity/fixtures/permissions_m8.yaml  NEW (~9 codes)
```

---

## Task 1: Branch + 4 models + permissions

Models per spec §3:

```python
"""Certification + training models."""
from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel


CERT_STATUSES: ClassVar[tuple] = (
    ("active", "Active"), ("expired", "Expired"), ("revoked", "Revoked"),
)
TRAINING_ASSIGNMENT_STATUSES: ClassVar[tuple] = (
    ("assigned", "Assigned"), ("in_progress", "In progress"),
    ("completed", "Completed"), ("overdue", "Overdue"),
)


class Certification(TenantBaseModel):
    employee_id = models.UUIDField()
    name = models.CharField(max_length=200)
    issuer = models.CharField(max_length=200, blank=True)
    certificate_number = models.CharField(max_length=100, blank=True)
    issued_on = models.DateField()
    expires_on = models.DateField(null=True, blank=True)
    document_s3_key = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=CERT_STATUSES, default="active")
    reminder_sent_30d = models.BooleanField(default=False)
    reminder_sent_60d = models.BooleanField(default=False)
    reminder_sent_90d = models.BooleanField(default=False)

    class Meta:
        db_table = "certification"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id"]),
            models.Index(fields=["org_id", "expires_on"]),
        ]

    def __str__(self) -> str: return f"{self.name} ({self.employee_id})"


class TrainingPlan(TenantBaseModel):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    required_for_role_id = models.UUIDField(null=True, blank=True)
    required_for_dept_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "training_plan"

    def __str__(self) -> str: return self.name


class TrainingAssignment(TenantBaseModel):
    plan = models.ForeignKey(TrainingPlan, on_delete=models.CASCADE, related_name="assignments")
    employee_id = models.UUIDField()
    assigned_by = models.UUIDField()
    due_date = models.DateField()
    status = models.CharField(max_length=16, choices=TRAINING_ASSIGNMENT_STATUSES, default="assigned")
    completed_at = models.DateTimeField(null=True, blank=True)
    evidence_s3_key = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "training_assignment"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["plan", "employee_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="training_assignment_unique_plan_emp",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "status"]),
            models.Index(fields=["org_id", "status"]),
        ]

    def __str__(self) -> str: return f"{self.plan.name}/{self.employee_id}/{self.status}"


class TrainingProgress(models.Model):
    id = models.BigAutoField(primary_key=True)
    assignment = models.ForeignKey(TrainingAssignment, on_delete=models.CASCADE, related_name="progress")
    progress_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "training_progress"
        indexes: ClassVar[list] = [models.Index(fields=["assignment", "-ts"])]
```

Permissions (9 codes):
```yaml
- { code: "cert:read:self",            description: Read own certifications }
- { code: "cert:read:team",            description: Read team certifications }
- { code: "cert:read:org",             description: Read all certifications }
- { code: "cert:write:self",           description: Add/edit own certifications }
- { code: "cert:write:org",            description: Edit any certification (HR) }
- { code: "training:plan:read",        description: Read training plans }
- { code: "training:plan:write",       description: Create/edit training plans }
- { code: "training:assignment:read:self", description: Read own training assignments }
- { code: "training:assignment:write:team", description: Assign training to team }
- { code: "training:progress:write:self",  description: Update own training progress }
```

(10 codes actually — adjust threshold to ≥ 94.)

Tests: 5-6 model tests covering basics + uniqueness.

Commit: `feat(certification): models — Certification, TrainingPlan, TrainingAssignment, TrainingProgress + M8 perms`

---

## Task 2: ExpiryScan service + Celery task

`services/expiry_scan.py`:

```python
"""Daily scan: certifications nearing expiry → notify; idempotent on flags."""
from __future__ import annotations

import datetime

from django.utils import timezone

from common.audit import append
from modules.certification.models import Certification


def scan_certification_expiry(*, org_id=None) -> dict[str, int]:
    """Find certs in {90, 60, 30} day windows that haven't been notified yet.

    Returns counts by window. Sets the corresponding `reminder_sent_*` flag
    so re-runs the next day don't re-send. Notifications are best-effort —
    the flag is set even if email send fails (avoids retry storms).
    """
    today = timezone.localdate()
    counts = {"30d": 0, "60d": 0, "90d": 0}
    qs = Certification.all_objects.filter(deleted_at__isnull=True, status="active")
    if org_id is not None:
        qs = qs.filter(org_id=org_id)

    for window_days, flag_name in [(90, "reminder_sent_90d"), (60, "reminder_sent_60d"), (30, "reminder_sent_30d")]:
        threshold = today + datetime.timedelta(days=window_days)
        candidates = qs.filter(
            expires_on=threshold,
            **{flag_name: False},
        )
        for cert in candidates:
            _notify(cert, days_remaining=window_days)
            setattr(cert, flag_name, True)
            cert.save(update_fields=[flag_name, "updated_at"])
            append(
                org_id=cert.org_id, action="certification.expiry_reminder",
                entity="certifications", entity_id=cert.id,
                before=None, after={"days_remaining": window_days},
            )
            counts[f"{window_days}d"] += 1

    # Mark expired certs
    expired = qs.filter(expires_on__lt=today, status="active")
    for cert in expired:
        cert.status = "expired"
        cert.save(update_fields=["status", "updated_at"])

    return counts


def _notify(cert, days_remaining: int) -> None:
    """Send in-app + email reminder. Best-effort."""
    from django.core.mail import send_mail
    from django.conf import settings
    try:
        send_mail(
            subject=f"[HRMS] Certification expiring in {days_remaining} days",
            message=f"Your certification '{cert.name}' expires on {cert.expires_on}.",
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "hrms@provintell.local"),
            recipient_list=[],  # employee email lookup omitted in M8 — Phase 2 wires this
            fail_silently=True,
        )
    except Exception:
        pass
```

`tasks.py`:

```python
"""Celery tasks for certification + training."""
from celery import shared_task


@shared_task
def detect_certification_expiry():
    from .services.expiry_scan import scan_certification_expiry
    return scan_certification_expiry()


@shared_task
def detect_training_overdue():
    """Mark assignments past due_date as overdue."""
    import datetime
    from django.utils import timezone
    from .models import TrainingAssignment
    today = timezone.localdate()
    n = TrainingAssignment.all_objects.filter(
        deleted_at__isnull=True,
        status__in=("assigned", "in_progress"),
        due_date__lt=today,
    ).update(status="overdue")
    return {"marked_overdue": n}
```

Wire into `apps/api/hrms_api/celery.py` beat schedule (or use `django-celery-beat` admin).

Tests:
- Cert expiring in exactly 90 days → reminder sent, 90d flag set
- Re-running same day → no double-notify
- Cert expiring in 89 days → no reminder yet (only triggers on the exact day)
- Past-expiry cert → status=expired
- Training assignment past due_date → status=overdue

Commit: `feat(certification): expiry scan service (90/60/30-day) + Celery tasks`

---

## Task 3: Endpoints

```
GET    /api/v1/certifications/me                 cert:read:self
GET    /api/v1/certifications?employee_id=&expiring_within_days=  cert:read:team / :org
POST   /api/v1/certifications                    cert:write:self (own) or cert:write:org (HR)
POST   /api/v1/certifications/{id}/document/presigned-upload      (presigned PUT URL)
POST   /api/v1/certifications/{id}/document      (register after upload)
PATCH  /api/v1/certifications/{id}
DELETE /api/v1/certifications/{id}

GET    /api/v1/training/plans                    training:plan:read
POST   /api/v1/training/plans                    training:plan:write
GET    /api/v1/training/assignments/me           training:assignment:read:self
GET    /api/v1/training/assignments?status=overdue  training:assignment:read:team
POST   /api/v1/training/assignments              training:assignment:write:team (single or bulk)
PATCH  /api/v1/training/progress/{id}            training:progress:write:self
POST   /api/v1/training/assignments/{id}/complete  multipart evidence
```

Tests: ~6 integration tests.

Regen contracts.

Commit: `feat(certification): /api/v1/certifications + /api/v1/training/* endpoints`

---

## Task 4: Frontend

`MyCertificationsPage`: list with expiry badges (red <30d, amber <60d, green active); add cert form.

`MyTrainingPage`: list of assignments + progress slider + complete button (with optional evidence).

`AdminCertPage`: all certs filterable by `expiring_within_days` (30/60/90/180); training plan management.

Build, commit: `feat(web): MyCertificationsPage + MyTrainingPage + AdminCertPage`

---

## Task 5: Close

CHANGELOG `[0.1.0-m8] - 2026-04-28`. Tag `v0.1.0-m8`. FF-merge.

---

## M8 Acceptance Criteria

- [ ] Employee uploads cert with document → S3 PUT then metadata register
- [ ] HR sees `/certifications?expiring_within_days=90` queue
- [ ] `detect_certification_expiry` Celery task: cert at exactly 90d → 90d reminder fires + flag set
- [ ] Re-run same day: no double-notify
- [ ] Cert past `expires_on` → status=expired auto-set
- [ ] Training assignment past due_date → status=overdue (via `detect_training_overdue` task)
- [ ] All M8 tests green
- [ ] Permission catalogue ≥ 94 codes
- [ ] Tag `v0.1.0-m8` on master HEAD; 9 tags total

That closes M8 — half-way through Phase 1's feature modules.
