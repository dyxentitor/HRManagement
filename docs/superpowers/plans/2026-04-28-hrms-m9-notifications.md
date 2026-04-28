# HRMS M9 — Notifications (Backend + UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the notifications module end-to-end: models, sending service, in-app + email channels, batched email digest, preferences, top-bar bell + slide-over UI, preferences page. Then wire existing modules (leave, claims, KPI, certification) to fire notifications on their domain events.

**Reality check:** the M5–M8 roadmap assumed notification infrastructure already shipped in M1. It didn't (M1's modules emit Django-signal events, but no `notifications` table or send service was built). M9 builds it from scratch.

**Architecture:**
- New module: `apps/api/modules/notification/`
- `Notification` model: per-user × per-type × per-channel record. Created when a domain event fires; in-app notifications are visible immediately, email goes through the hourly digest.
- `NotificationPreferences`: per-user × per-type × per-channel toggle. Defaults seeded on user create.
- Existing module signal handlers (`leave.signals`, `claims.signals`, `kpi.signals`, `certification.signals`) get a one-line addition: call `notify(...)` after their existing domain logic.
- Email batching: hourly Celery task `send_pending_email_digests` collects unread non-sent in-app notifications per user and emails one digest.

**Spec reference:** spec §3 (`notifications`, `notification_preferences`), §4 (`/notifications/*`), §6 (modules emit events), §7 (notification UI).

**Branch:** create `m9/notifications` from master at Task 1 Step 1.

---

## File structure

```
apps/api/modules/notification/                NEW
├── __init__.py, apps.py
├── models.py                                  Notification, NotificationPreference, EmailDigestRun
├── services/
│   ├── __init__.py
│   ├── notify.py                              notify(user, type, payload, deep_link, priority)
│   ├── digest.py                              build + send batched email
│   └── preferences.py                         get/set + seed defaults
├── tasks.py                                   Celery: send_pending_email_digests (hourly)
├── signals.py                                 default-preferences-on-create + helpers used by other modules
├── serializers.py, views.py, urls.py
├── admin.py
├── migrations/
└── tests/

apps/api/modules/{leave,claims,kpi,certification}/signals.py   MODIFY (add notify() calls)

apps/web/src/modules/notifications/            NEW
├── api.ts, routes.tsx
└── pages/PreferencesPage.tsx

apps/web/src/components/                       MODIFY
├── NotificationBell.tsx                       NEW
├── NotificationPanel.tsx                      NEW
└── shell/TopBar.tsx                           MODIFY (embed bell)

apps/api/modules/identity/fixtures/permissions_m9.yaml  NEW (~3 codes)
```

---

## Task 1: Branch + 3 models + permissions

**Files:** package skeleton + models + admin + permission fixture + role updates

- [ ] **Step 1: Branch + skeleton**

```
git checkout master
git checkout -b m9/notifications
mkdir -p apps/api/modules/notification/{services,tests,migrations}
touch apps/api/modules/notification/__init__.py \
      apps/api/modules/notification/services/__init__.py \
      apps/api/modules/notification/migrations/__init__.py \
      apps/api/modules/notification/tests/__init__.py
```

- [ ] **Step 2: AppConfig**

`apps.py`:
```python
from django.apps import AppConfig


class NotificationConfig(AppConfig):
    name = "modules.notification"
    label = "notification"
    verbose_name = "Notifications"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
```

Create empty `signals.py` stub (filled in Task 2).

- [ ] **Step 3: Write failing model tests**

`tests/test_models.py`:

```python
"""Notification models tests."""
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.identity.models import User
from modules.notification.models import (
    EmailDigestRun, Notification, NotificationPreference,
)


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def user():
    return User.objects.create_user(email="u@x.com", password="x", org_id=uuid.uuid4())  # pragma: allowlist secret


@pytest.mark.django_db
def test_notification_create(user):
    n = Notification.objects.create(
        org_id=user.org_id, user=user, type="leave.approved",
        channel="in_app", payload={"leave_id": str(uuid.uuid4())},
        deep_link="/leave/me",
    )
    assert n.read_at is None
    assert n.priority == "normal"


@pytest.mark.django_db
def test_notification_mark_read(user):
    n = Notification.objects.create(
        org_id=user.org_id, user=user, type="x",
        channel="in_app", payload={},
    )
    n.mark_read()
    n.refresh_from_db()
    assert n.read_at is not None


@pytest.mark.django_db
def test_preference_unique_per_user_type_channel(user):
    NotificationPreference.objects.create(user=user, type="leave.approved", channel="email", enabled=True)
    with pytest.raises(IntegrityError):
        NotificationPreference.objects.create(user=user, type="leave.approved", channel="email", enabled=False)


@pytest.mark.django_db
def test_email_digest_run(user):
    n = Notification.objects.create(
        org_id=user.org_id, user=user, type="x", channel="in_app", payload={},
    )
    run = EmailDigestRun.objects.create(
        org_id=user.org_id, user=user, notification_count=1,
    )
    run.notifications.add(n)
    assert run.notifications.count() == 1


@pytest.mark.django_db
def test_priority_choices(user):
    n = Notification.objects.create(
        org_id=user.org_id, user=user, type="x", channel="in_app",
        payload={}, priority="urgent",
    )
    assert n.priority == "urgent"
```

- [ ] **Step 4: Implement `models.py`**

```python
"""Notification + NotificationPreference + EmailDigestRun."""
from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone


CHANNELS: ClassVar[tuple] = (("in_app", "In-app"), ("email", "Email"))
PRIORITIES: ClassVar[tuple] = (
    ("low", "Low"), ("normal", "Normal"), ("high", "High"), ("urgent", "Urgent"),
)
DELIVERY_STATUSES: ClassVar[tuple] = (
    ("pending", "Pending"), ("sent", "Sent"),
    ("failed", "Failed"), ("skipped", "Skipped"),
)


class Notification(models.Model):
    """Individual notification row.

    Created by `notify()` for each (user × channel) combination matching the
    user's preferences. In-app notifications are visible to the user immediately;
    email-channel rows are picked up by the hourly digest task.
    """
    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="notifications",
    )
    type = models.CharField(max_length=64)  # e.g. 'leave.approved'
    channel = models.CharField(max_length=16, choices=CHANNELS)
    payload = models.JSONField(default=dict)
    deep_link = models.CharField(max_length=500, blank=True)
    priority = models.CharField(max_length=8, choices=PRIORITIES, default="normal")
    delivery_status = models.CharField(max_length=16, choices=DELIVERY_STATUSES, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "notification"
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "channel", "delivery_status"]),
            models.Index(fields=["user", "read_at"]),
        ]

    def mark_read(self) -> None:
        if self.read_at is None:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at"])

    def __str__(self) -> str:
        return f"{self.type}/{self.channel}/{self.user.email}"


class NotificationPreference(models.Model):
    """User × type × channel preference. Missing rows = use system default."""
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="notification_preferences",
    )
    type = models.CharField(max_length=64)
    channel = models.CharField(max_length=16, choices=CHANNELS)
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preference"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "type", "channel"],
                name="notification_pref_unique_user_type_channel",
            ),
        ]


class EmailDigestRun(models.Model):
    """One row per user per digest send (audit). Tracks which notifications were bundled."""
    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="email_digest_runs",
    )
    notification_count = models.IntegerField(default=0)
    sent_at = models.DateTimeField(default=timezone.now)
    notifications = models.ManyToManyField(Notification, related_name="digest_runs")

    class Meta:
        db_table = "notification_email_digest_run"
        indexes: ClassVar[list] = [models.Index(fields=["user", "-sent_at"])]
```

- [ ] **Step 5: Permission codes + role updates**

`permissions_m9.yaml`:
```yaml
- { code: "notification:read:self",                description: Read own notifications }
- { code: "notification:preferences:write:self",   description: Edit own notification preferences }
- { code: "notification:digest:read:org",          description: Audit email digest runs (HR/admin) }
```

Update `default_roles.yaml`:
- All non-auditor roles: `notification:read:self`, `notification:preferences:write:self`
- `org_admin`, `hr_manager`, `auditor`: `notification:digest:read:org`

Threshold ≥ 97.

- [ ] **Step 6: Register app + migration + tests + admin + commit**

Edit `settings/base.py`. Add `"modules.notification",` after `"modules.certification",`.

```
cd apps/api && uv run python manage.py makemigrations notification 2>&1 | tail -5 && uv run pytest modules/notification/tests/test_models.py modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -10; cd ../..
```

Admin:
```python
from django.contrib import admin

from .models import EmailDigestRun, Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("type", "channel", "user", "delivery_status", "read_at", "created_at")
    list_filter = ("channel", "delivery_status", "priority")
    search_fields = ("type", "user__email")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "channel", "enabled")
    list_filter = ("channel", "enabled")


@admin.register(EmailDigestRun)
class EmailDigestRunAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_count", "sent_at")
    date_hierarchy = "sent_at"
```

Commit: `feat(notification): models + M9 permission codes`

---

## Task 2: notify() service + preferences seeding

**Files:**
- Replace: `apps/api/modules/notification/signals.py`
- Create: `apps/api/modules/notification/services/notify.py`
- Create: `apps/api/modules/notification/services/preferences.py`
- Create: `apps/api/modules/notification/tests/test_notify.py`

- [ ] **Step 1: Default preferences catalogue**

The notification system has a finite set of types. List them in `services/preferences.py`:

```python
"""Notification preferences — system default catalogue + helpers."""
from __future__ import annotations

from modules.notification.models import NotificationPreference


# (type, in_app_default, email_default, security_relevant)
# security_relevant: True means user can't disable (always sent)
DEFAULT_PREFERENCES: list[tuple[str, bool, bool, bool]] = [
    # auth
    ("auth.login", False, False, True),
    ("auth.password_changed", True, True, True),
    ("auth.mfa_enabled", True, True, True),
    ("auth.mfa_disabled", True, True, True),
    # employee
    ("employee.bank_changed_self", True, True, True),  # HR notification
    ("employee.probation_ending_soon", True, True, False),
    ("employee.contract_ending_soon", True, True, False),
    # leave
    ("leave.submitted", True, False, False),  # to approver
    ("leave.approved", True, True, False),    # to requester
    ("leave.rejected", True, True, False),
    ("leave.cancelled", True, False, False),
    ("leave.replacement_granted", True, True, False),
    # claims
    ("claim.submitted", True, False, False),
    ("claim.approved", True, True, False),
    ("claim.rejected", True, True, False),
    ("claim.reimbursed", True, True, False),
    # kpi
    ("kpi.cycle_opens_self_review", True, True, False),
    ("kpi.cycle_opens_manager_review", True, True, False),
    ("kpi.review_submitted_self", True, False, False),
    ("kpi.review_submitted_manager", True, True, False),
    # certification
    ("cert.expiring_soon", True, True, False),
    # schedule
    ("schedule.roster_published", True, True, False),
]

SECURITY_TYPES: frozenset[str] = frozenset(
    t for t, _i, _e, sec in DEFAULT_PREFERENCES if sec
)


def is_security_type(type_code: str) -> bool:
    return type_code in SECURITY_TYPES


def default_for(type_code: str, channel: str) -> bool:
    for t, in_app, email, _ in DEFAULT_PREFERENCES:
        if t == type_code:
            return in_app if channel == "in_app" else email
    return True  # unknown type: opt-in by default


def is_enabled(*, user, type_code: str, channel: str) -> bool:
    """True if user wants this notification on this channel.

    Security-relevant types always return True regardless of preference.
    """
    if is_security_type(type_code):
        return True
    pref = NotificationPreference.objects.filter(
        user=user, type=type_code, channel=channel,
    ).first()
    if pref is not None:
        return pref.enabled
    return default_for(type_code, channel)


def seed_for_user(user) -> int:
    """Seed default preferences for a freshly-created user. Idempotent."""
    n_created = 0
    for type_code, in_app, email, _ in DEFAULT_PREFERENCES:
        for channel, enabled in [("in_app", in_app), ("email", email)]:
            _, created = NotificationPreference.objects.get_or_create(
                user=user, type=type_code, channel=channel,
                defaults={"enabled": enabled},
            )
            if created:
                n_created += 1
    return n_created
```

- [ ] **Step 2: notify() service**

`services/notify.py`:

```python
"""notify() — the public API used by other modules."""
from __future__ import annotations

import uuid
from typing import Any

from modules.identity.models import User

from ..models import Notification
from .preferences import is_enabled


def notify(
    *,
    user: User,
    type: str,
    payload: dict[str, Any] | None = None,
    deep_link: str = "",
    priority: str = "normal",
) -> list[Notification]:
    """Create notification rows for the user across enabled channels.

    Returns the list of rows actually created (one per enabled channel).
    """
    payload = payload or {}
    created: list[Notification] = []

    for channel in ("in_app", "email"):
        if not is_enabled(user=user, type_code=type, channel=channel):
            continue
        n = Notification.objects.create(
            org_id=user.org_id, user=user,
            type=type, channel=channel,
            payload=payload, deep_link=deep_link, priority=priority,
        )
        created.append(n)
    return created
```

- [ ] **Step 3: Default-preferences-on-create signal**

`signals.py`:

```python
"""Seed default preferences on User create."""
from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from modules.identity.models import User

from .services.preferences import seed_for_user


@receiver(post_save, sender=User)
def _seed_preferences_on_user_create(sender, instance: User, created: bool, **kwargs):
    if not created:
        return
    seed_for_user(instance)
```

- [ ] **Step 4: Tests**

`tests/test_notify.py`:

```python
"""notify() service + preferences."""
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.identity.models import User
from modules.notification.models import Notification, NotificationPreference
from modules.notification.services.notify import notify
from modules.notification.services.preferences import is_enabled, seed_for_user


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def user():
    return User.objects.create_user(email="u@x.com", password="x", org_id=uuid.uuid4())  # pragma: allowlist secret


@pytest.mark.django_db
def test_user_create_seeds_preferences(user):
    """The post_save signal should seed default preferences on user create."""
    # User fixture already created the user, signal fired
    assert NotificationPreference.objects.filter(user=user).count() > 0


@pytest.mark.django_db
def test_notify_creates_in_app_and_email(user):
    """Default for leave.approved is in_app=True, email=True."""
    rows = notify(
        user=user, type="leave.approved",
        payload={"leave_id": "abc"}, deep_link="/leave/me",
    )
    assert len(rows) == 2
    assert {r.channel for r in rows} == {"in_app", "email"}


@pytest.mark.django_db
def test_notify_respects_disabled_preference(user):
    """If user disables email for leave.approved, no email row created."""
    NotificationPreference.objects.update_or_create(
        user=user, type="leave.approved", channel="email",
        defaults={"enabled": False},
    )
    rows = notify(user=user, type="leave.approved", payload={})
    assert len(rows) == 1
    assert rows[0].channel == "in_app"


@pytest.mark.django_db
def test_security_type_cannot_be_disabled(user):
    """Even if disabled in preferences, security-relevant types always send."""
    NotificationPreference.objects.update_or_create(
        user=user, type="auth.password_changed", channel="email",
        defaults={"enabled": False},
    )
    assert is_enabled(user=user, type_code="auth.password_changed", channel="email") is True

    rows = notify(user=user, type="auth.password_changed", payload={})
    channels = {r.channel for r in rows}
    assert "email" in channels


@pytest.mark.django_db
def test_unknown_type_uses_default_true(user):
    rows = notify(user=user, type="some.new.type", payload={})
    assert len(rows) == 2  # in_app + email both default True
```

- [ ] **Step 5: Run tests + commit**

```
cd apps/api && uv run pytest modules/notification/ -v 2>&1 | tail -15; cd ../..
```
Expected: 5 model + 5 notify = 10 tests pass.

```
git add apps/api/modules/notification/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(notification): notify() service + preferences seed-on-user-create"
```

---

## Task 3: Email digest Celery task + endpoints

**Files:**
- Create: `apps/api/modules/notification/services/digest.py`
- Create: `apps/api/modules/notification/tasks.py`
- Create: `apps/api/modules/notification/serializers.py`
- Create: `apps/api/modules/notification/views.py`
- Create: `apps/api/modules/notification/urls.py`
- Modify: `apps/api/hrms_api/urls.py`
- Create: `apps/api/modules/notification/tests/test_digest.py`
- Create: `apps/api/modules/notification/tests/test_endpoints.py`

- [ ] **Step 1: Digest service**

`services/digest.py`:

```python
"""Email digest service — batches pending email notifications hourly."""
from __future__ import annotations

from collections import defaultdict

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from modules.identity.models import User
from modules.notification.models import EmailDigestRun, Notification


def send_digests() -> dict[str, int]:
    """For each user with pending email notifications, send one digest + mark sent."""
    pending = (
        Notification.objects.filter(
            channel="email", delivery_status="pending",
        )
        .select_related("user")
        .order_by("user_id", "-priority", "created_at")
    )

    by_user: dict[int, list[Notification]] = defaultdict(list)
    for n in pending:
        by_user[n.user_id].append(n)

    n_users = 0
    n_notifs = 0
    for user_id, notifs in by_user.items():
        user = notifs[0].user
        if not user.email:
            # No email address; mark skipped
            for n in notifs:
                n.delivery_status = "skipped"
                n.sent_at = timezone.now()
                n.save(update_fields=["delivery_status", "sent_at"])
            continue

        body_lines = [f"You have {len(notifs)} new HRMS notification(s):", ""]
        for n in notifs:
            body_lines.append(f"  • [{n.type}] — {n.payload}")
        body = "\n".join(body_lines)

        try:
            send_mail(
                subject=f"[HRMS] {len(notifs)} new notification(s)",
                message=body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "hrms@provintell.local"),
                recipient_list=[user.email],
                fail_silently=False,
            )
            run = EmailDigestRun.objects.create(
                org_id=user.org_id, user=user, notification_count=len(notifs),
            )
            run.notifications.set(notifs)
            for n in notifs:
                n.delivery_status = "sent"
                n.sent_at = timezone.now()
                n.save(update_fields=["delivery_status", "sent_at"])
            n_users += 1
            n_notifs += len(notifs)
        except Exception:
            for n in notifs:
                n.delivery_status = "failed"
                n.save(update_fields=["delivery_status"])

    return {"users": n_users, "notifications": n_notifs}
```

- [ ] **Step 2: Celery task**

`tasks.py`:

```python
from celery import shared_task


@shared_task
def send_pending_email_digests():
    from .services.digest import send_digests
    return send_digests()
```

(Celery beat schedule is added in Task 6 — `celery.py` config.)

- [ ] **Step 3: Endpoints**

Standard ViewSets pattern. Endpoints:

```
GET    /api/v1/notifications?unread_only=true&cursor=     notification:read:self
PATCH  /api/v1/notifications/{id}/read                     notification:read:self
POST   /api/v1/notifications/read-all                       notification:read:self
GET    /api/v1/notifications/preferences                    notification:read:self
PATCH  /api/v1/notifications/preferences                    notification:preferences:write:self
                                                             body: [{type, channel, enabled}, ...]
```

- [ ] **Step 4: Tests**

`tests/test_digest.py` — 4 tests:
- Sends one email per user with pending email rows
- Marks notifications sent + creates EmailDigestRun
- User without email → skipped
- Empty queue → no-op (returns {users:0})

`tests/test_endpoints.py` — 5 tests:
- List own notifications
- Mark single read
- Mark all read
- Get preferences
- Bulk-update preferences (security types ignored)

- [ ] **Step 5: Commit**

```
git add apps/api/modules/notification/ apps/api/hrms_api/urls.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(notification): email digest Celery task + /api/v1/notifications/* endpoints"
```

---

## Task 4: Wire existing modules to call notify()

**Files (one-line additions to each):**
- Modify: `apps/api/modules/leave/signals.py`
- Modify: `apps/api/modules/claims/signals.py`
- Modify: `apps/api/modules/kpi/services/review.py`
- Modify: `apps/api/modules/certification/services/expiry_scan.py`
- Modify: `apps/api/modules/identity/services/auth.py` (login/password change events)

For each module, find where the domain action completes (e.g., `LeaveRequestService.act` after engine.act runs) and add a `notify(...)` call. Pattern:

```python
# In leave/signals.py — when workflow_step_approved fires for the final level on a leave request:
from modules.notification.services.notify import notify

# After updating the LeaveApproval row:
notify(
    user=subject.employee.user,
    type="leave.approved" if final else "leave.step_approved",
    payload={"leave_request_id": str(subject.id), "leave_type": subject.leave_type.code},
    deep_link=f"/leave/me",
)
```

Apply similar one-liners to:
- `leave.submitted` (notify approver), `leave.approved`/`rejected`/`cancelled` (notify requester)
- `claim.submitted` (notify approver), `claim.approved`/`rejected`/`reimbursed` (notify requester)
- `kpi.cycle_opens_self_review` (notify all employees with assignments), `kpi.review_submitted_manager` (notify employee)
- `cert.expiring_soon` (notify employee + manager) — replace the placeholder `_notify` in `expiry_scan.py` with a real call

Tests: extend each module's existing tests to assert `Notification.objects.count() > 0` after the action.

- [ ] **Step 1: Wire each module + add assertion to existing tests**

(Don't write new test files — augment the existing tests for each module.)

- [ ] **Step 2: Run full backend suite**

```
cd apps/api && uv run pytest -q 2>&1 | tail -5; cd ../..
```
Expected: all green; new notification rows visible after leave/claim/kpi/cert actions.

- [ ] **Step 3: Commit**

```
git add apps/api/modules/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(notification): wire leave/claims/kpi/cert/auth modules to call notify()"
```

---

## Task 5: Frontend — Bell + Panel + PreferencesPage

**Files:**
- Create: `apps/web/src/modules/notifications/api.ts`
- Create: `apps/web/src/modules/notifications/routes.tsx`
- Create: `apps/web/src/modules/notifications/pages/PreferencesPage.tsx`
- Create: `apps/web/src/components/NotificationBell.tsx`
- Create: `apps/web/src/components/NotificationPanel.tsx`
- Modify: `apps/web/src/components/shell/TopBar.tsx`
- Modify: `apps/web/src/App.tsx`

`NotificationBell.tsx`: polls `/notifications?unread_only=true&limit=20` every 60s; shows count badge. Click → open `NotificationPanel` slide-over.

`NotificationPanel.tsx`: lists notifications grouped Today/Yesterday/Older. Click row → navigate to `deep_link` and call `markRead`. "Mark all read" button calls `read-all`.

`PreferencesPage.tsx`: matrix of (type × channel) checkboxes; security types are checked + disabled.

Build + commit: `feat(web): NotificationBell + Panel + PreferencesPage`

---

## Task 6: Celery beat schedule + M9 close

- [ ] **Step 1: Wire the digest task into Celery beat**

Edit `apps/api/hrms_api/celery.py` — add to `app.conf.beat_schedule`:

```python
"send-pending-email-digests": {
    "task": "modules.notification.tasks.send_pending_email_digests",
    "schedule": 3600.0,  # hourly
},
```

If using `django-celery-beat`'s database scheduler, register via fixture or admin instead. Either works; pick whichever matches the existing Celery beat setup.

- [ ] **Step 2: CHANGELOG + tag + merge**

```markdown
## [0.1.0-m9] - 2026-04-28

### Added
- **M9 — Notifications module:** `Notification`/`NotificationPreference`/`EmailDigestRun` models. `notify()` service that respects user preferences (security-relevant types always send). Default preferences seeded on user create. Hourly Celery digest task batches pending email notifications. Endpoints `/api/v1/notifications/*` (list, read, read-all, preferences). Frontend: `NotificationBell` + `NotificationPanel` (slide-over) + `PreferencesPage` (type × channel toggle matrix). Existing modules (leave, claims, KPI, certification, auth) now call `notify()` on domain events. 3 new permission codes — catalogue 94 → 97.
```

```
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M9 milestone complete — release 0.1.0-m9"
git tag -a v0.1.0-m9 -m "M9: Notifications (backend + UX)"
git checkout master
git merge --ff-only m9/notifications
git branch -d m9/notifications
```

---

## M9 Acceptance Criteria

- [ ] User creating triggers default-preferences seeding (post_save signal)
- [ ] `notify(user=..., type='leave.approved', ...)` creates 1 in_app + 1 email row by default
- [ ] User disabling email for leave.approved → only in_app row created
- [ ] Security-relevant types (auth.password_changed) always send regardless of preference
- [ ] Unknown type defaults to in_app=True, email=True (opt-in)
- [ ] Hourly digest task: groups pending email rows by user, sends one email, marks sent + creates EmailDigestRun
- [ ] Bell shows unread count; panel groups by Today/Yesterday/Older; click → navigate + mark read
- [ ] Preferences page renders + persists toggle changes
- [ ] Permission catalogue ≥ 97 codes
- [ ] All M9 tests green; full backend + frontend suites green
- [ ] 10 tags total (`v0.1.0-m{0..9}`)

That closes M9. Next: **M10 — Dashboards + Unified Approvals Inbox**.
