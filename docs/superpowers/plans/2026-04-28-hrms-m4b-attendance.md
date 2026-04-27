# HRMS M4b — Attendance + Holiday-Replacement Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the attendance module: clock-in/out endpoints that record per-day attendance, the rule that fires `BalanceService.grant_replacement` when a shift worker clocks in on a public holiday, and a couple of queries (`/today`, `/records`, `/team`). Idempotency on the holiday→replacement grant is critical (re-running the same attendance event must NOT double-grant).

**Architecture:**
- New module: `apps/api/modules/attendance/`
- `AttendanceRecord` model: one row per `(employee_id, work_date)` with `clock_in`, `clock_out`, `source`, `is_holiday_work`, `holiday_id`, `shift_assignment_id`, `status`, `ip`, `user_agent`. Soft-delete inherited.
- Clock-in flow: POST `/api/v1/attendance/clock-in` finds-or-creates today's record, sets `clock_in=now`, computes `is_holiday_work` if today is a holiday for this org, fires the `attendance.HolidayWorkConfirmed` event (Django signal). Clock-out: stamps `clock_out=now`.
- Holiday-work signal handler is in `attendance/signals.py`. When fired, it calls `BalanceService.grant_replacement` with `reference_type="attendance_record"`, `reference_id=record.id`, `reason="holiday_replacement"` — already idempotent thanks to the M3b ledger uniqueness constraint.
- The grant only fires for shift workers (`employee.schedule_type == 'shift'`). Fixed-staff who happen to clock in on a holiday don't get a replacement (per M2 spec lock).
- Idempotency at the API layer: `Idempotency-Key` header on clock-in/out POSTs (per spec §4) — but for M4b minimal we accept the ledger-level idempotency as sufficient. (Phase 2 hardens with proper request-replay caching.)

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`attendance_records`), §4 (clock endpoints), §6 (HolidayWorkConfirmed event chain).

**Branch:** `m4/schedule` (current).

---

## File structure

```
apps/api/modules/attendance/                  NEW
├── __init__.py
├── apps.py
├── models.py                                  AttendanceRecord
├── services.py                                AttendanceService (clock_in / clock_out / today)
├── signals.py                                 attendance_clocked + handler that grants replacement leave
├── serializers.py
├── views.py
├── urls.py
├── admin.py
├── migrations/__init__.py
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_clock_flow.py
    ├── test_holiday_replacement.py
    └── test_endpoints.py
```

---

## Task 1: AttendanceRecord model + service skeleton

**Files:**
- Create: `apps/api/modules/attendance/{__init__.py, apps.py, models.py, services.py, admin.py, migrations/__init__.py, tests/__init__.py, tests/test_models.py}`
- Modify: `apps/api/hrms_api/settings/base.py` (register module)

- [ ] **Step 1: Skeleton + AppConfig**

```
mkdir -p apps/api/modules/attendance/{tests,migrations}
touch apps/api/modules/attendance/__init__.py \
      apps/api/modules/attendance/migrations/__init__.py \
      apps/api/modules/attendance/tests/__init__.py
```

`apps/api/modules/attendance/apps.py`:
```python
from django.apps import AppConfig


class AttendanceConfig(AppConfig):
    name = "modules.attendance"
    label = "attendance"
    verbose_name = "Attendance"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
```

- [ ] **Step 2: Failing model tests**

`apps/api/modules/attendance/tests/test_models.py`:

```python
"""AttendanceRecord model basics."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.attendance.models import AttendanceRecord
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def employee():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    return Employee.all_objects.create(
        org_id=org.id, employee_code="E1",
        first_name="A", last_name="B", email="a@x.com", phone="+1",
        date_of_birth=datetime.date(1985, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_attendance_record_create(employee) -> None:
    r = AttendanceRecord.all_objects.create(
        org_id=employee.org_id, employee=employee,
        work_date=datetime.date(2026, 6, 1),
        source="web",
    )
    assert r.is_holiday_work is False
    assert r.status == "absent"  # no clock_in/out yet


@pytest.mark.django_db
def test_unique_per_employee_date(employee) -> None:
    AttendanceRecord.all_objects.create(
        org_id=employee.org_id, employee=employee,
        work_date=datetime.date(2026, 6, 1), source="web",
    )
    with pytest.raises(IntegrityError):
        AttendanceRecord.all_objects.create(
            org_id=employee.org_id, employee=employee,
            work_date=datetime.date(2026, 6, 1), source="web",
        )


@pytest.mark.django_db
def test_status_transitions_with_clock(employee) -> None:
    import datetime as dt
    r = AttendanceRecord.all_objects.create(
        org_id=employee.org_id, employee=employee,
        work_date=datetime.date(2026, 6, 1),
        clock_in=dt.datetime(2026, 6, 1, 9, 0, tzinfo=dt.timezone.utc),
        source="web",
    )
    r.recompute_status()
    r.save()
    assert r.status in ("present", "late", "partial")
```

- [ ] **Step 3: Run failing tests**

```
cd apps/api && uv run pytest modules/attendance/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 4: Implement `apps/api/modules/attendance/models.py`**

```python
"""AttendanceRecord — one row per (employee, work_date)."""
from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel


SOURCE_CHOICES: ClassVar[tuple] = (
    ("web", "Web"),
    ("kiosk", "Kiosk"),
    ("mobile", "Mobile"),
    ("admin", "Admin"),
)
STATUS_CHOICES: ClassVar[tuple] = (
    ("present", "Present"),
    ("late", "Late"),
    ("absent", "Absent"),
    ("holiday", "Holiday"),
    ("on_leave", "On leave"),
    ("partial", "Partial"),
)


class AttendanceRecord(TenantBaseModel):
    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="attendance_records"
    )
    work_date = models.DateField()
    clock_in = models.DateTimeField(null=True, blank=True)
    clock_out = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=8, choices=SOURCE_CHOICES, default="web")
    is_holiday_work = models.BooleanField(default=False)
    holiday_id = models.UUIDField(null=True, blank=True)
    shift_assignment_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="absent")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "attendance_record"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee", "work_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="attendance_unique_emp_date",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "employee", "-work_date"]),
            models.Index(fields=["org_id", "work_date"]),
        ]

    @property
    def computed_hours(self):
        """Decimal hours between clock_in and clock_out."""
        if self.clock_in and self.clock_out:
            delta = self.clock_out - self.clock_in
            return round(delta.total_seconds() / 3600, 2)
        return None

    def recompute_status(self) -> None:
        """Set the status from clock_in/out + flags. Called by service after writes."""
        if self.clock_in is None and self.clock_out is None:
            self.status = "absent"
        elif self.clock_in is not None and self.clock_out is None:
            self.status = "partial"
        else:
            # Both present → present (late detection requires schedule lookup; M5+ feature)
            self.status = "present"

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.work_date}/{self.status}"
```

- [ ] **Step 5: Generate migration + run tests**

Edit `apps/api/hrms_api/settings/base.py`. Add `"modules.attendance",` after `"modules.schedule",`.

```
cd apps/api && uv run python manage.py makemigrations attendance 2>&1 | tail -5 && uv run pytest modules/attendance/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```
Expected: 3 PASS.

- [ ] **Step 6: Admin**

```python
from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("employee", "work_date", "clock_in", "clock_out", "status", "is_holiday_work")
    list_filter = ("status", "is_holiday_work", "source")
    date_hierarchy = "work_date"
    search_fields = ("employee__employee_code",)
```

- [ ] **Step 7: Commit Task 1**

```
git add apps/api/modules/attendance/ apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(attendance): AttendanceRecord model + admin"
```

---

## Task 2: AttendanceService + holiday-replacement signal

**Files:**
- Create / replace: `apps/api/modules/attendance/services.py`
- Create: `apps/api/modules/attendance/signals.py`
- Create: `apps/api/modules/attendance/tests/test_clock_flow.py`
- Create: `apps/api/modules/attendance/tests/test_holiday_replacement.py`

- [ ] **Step 1: Write failing flow tests**

`apps/api/modules/attendance/tests/test_clock_flow.py`:

```python
"""Clock-in / clock-out service flow."""
import datetime as dt
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from freezegun import freeze_time

from modules.attendance.models import AttendanceRecord
from modules.attendance.services import AttendanceService
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def employee():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    return Employee.all_objects.create(
        org_id=org.id, employee_code="E1",
        first_name="A", last_name="B", email="a@x.com", phone="+1",
        date_of_birth=dt.date(1985, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
@freeze_time("2026-06-01 09:00:00")
def test_clock_in_creates_record(employee):
    rec = AttendanceService.clock_in(employee=employee, source="web", ip="127.0.0.1", user_agent="pytest")
    assert rec.work_date == dt.date(2026, 6, 1)
    assert rec.clock_in is not None
    assert rec.status == "partial"


@pytest.mark.django_db
@freeze_time("2026-06-01 09:00:00")
def test_clock_in_idempotent_on_same_day(employee):
    """Calling clock_in twice on the same day returns the same record (no duplicate)."""
    r1 = AttendanceService.clock_in(employee=employee, source="web")
    r2 = AttendanceService.clock_in(employee=employee, source="web")
    assert r1.id == r2.id
    assert AttendanceRecord.all_objects.count() == 1


@pytest.mark.django_db
def test_clock_out_completes_record(employee):
    with freeze_time("2026-06-01 09:00:00"):
        AttendanceService.clock_in(employee=employee, source="web")
    with freeze_time("2026-06-01 18:00:00"):
        rec = AttendanceService.clock_out(employee=employee, source="web")
    assert rec.clock_out is not None
    assert rec.status == "present"
    assert rec.computed_hours == 9.0


@pytest.mark.django_db
def test_clock_out_without_clock_in_creates_record_with_warning(employee):
    """Calling clock_out without prior clock_in creates a partial record (allowed but flagged)."""
    with freeze_time("2026-06-01 18:00:00"):
        rec = AttendanceService.clock_out(employee=employee, source="web")
    assert rec.clock_in is None
    assert rec.clock_out is not None
    assert rec.status == "partial"


@pytest.mark.django_db
def test_today_record_returns_or_none(employee):
    with freeze_time("2026-06-01 12:00:00"):
        # No record yet
        assert AttendanceService.today(employee=employee) is None
        AttendanceService.clock_in(employee=employee, source="web")
        rec = AttendanceService.today(employee=employee)
        assert rec is not None
```

`apps/api/modules/attendance/tests/test_holiday_replacement.py`:

```python
"""When a SHIFT worker clocks in on a public holiday, +1 REPLACEMENT leave."""
import datetime as dt
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from freezegun import freeze_time

from modules.attendance.services import AttendanceService
from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.organization.models import Department, Organization
from modules.schedule.models import Holiday


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    # Create REPLACEMENT leave type (M3b seeds this from country defaults)
    replacement = LeaveType.all_objects.create(
        org_id=org.id, code="REPLACEMENT", name="Replacement Leave",
        accrual_type="event_based", default_days=Decimal("0"),
        is_paid=True, is_statutory=False, gender_restriction="any",
    )
    # Holiday on 2026-05-01
    Holiday.all_objects.create(
        org_id=org.id, date=dt.date(2026, 5, 1), name="Labour Day",
        type="federal", applies_to_country_code="MY",
    )

    def _emp(code, schedule_type):
        return Employee.all_objects.create(
            org_id=org.id, employee_code=code,
            first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
            date_of_birth=dt.date(1985, 1, 1), gender="other", nationality="MY",
            marital_status="single", address_line1="x", city="x", state="x",
            postcode="00000", country_code="MY", department=dept,
            role_title="x", employment_type="fulltime", schedule_type=schedule_type,
            hire_date=dt.date(2024, 1, 1), bank_name="x",
            emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
        )

    shift_emp = _emp("SHIFT", "shift")
    fixed_emp = _emp("FIXED", "fixed")
    return org, replacement, shift_emp, fixed_emp


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_shift_worker_holiday_clockin_grants_replacement(stack):
    org, replacement, shift_emp, _ = stack
    rec = AttendanceService.clock_in(employee=shift_emp, source="web")
    assert rec.is_holiday_work is True
    assert rec.holiday_id is not None

    bal = LeaveBalance.all_objects.get(
        employee_id=shift_emp.id, leave_type=replacement, year=2026,
    )
    assert bal.accrued == Decimal("1")
    assert bal.available == Decimal("1")


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_fixed_worker_holiday_clockin_does_not_grant(stack):
    org, replacement, _, fixed_emp = stack
    AttendanceService.clock_in(employee=fixed_emp, source="web")
    # No REPLACEMENT balance was created for fixed-staff
    assert LeaveBalance.all_objects.filter(
        employee_id=fixed_emp.id, leave_type=replacement,
    ).count() == 0


@pytest.mark.django_db
@freeze_time("2026-05-01 06:00:00")
def test_replacement_grant_idempotent(stack):
    """Re-running clock_in on the same record must NOT double-grant."""
    org, replacement, shift_emp, _ = stack
    AttendanceService.clock_in(employee=shift_emp, source="web")
    AttendanceService.clock_in(employee=shift_emp, source="web")  # second call

    bal = LeaveBalance.all_objects.get(
        employee_id=shift_emp.id, leave_type=replacement, year=2026,
    )
    # Still 1, not 2
    assert bal.accrued == Decimal("1")
    # Ledger has exactly one row for this reference
    rows = LeaveBalanceLedger.objects.filter(
        reference_type="attendance_record",
        reason="holiday_replacement",
    )
    assert rows.count() == 1


@pytest.mark.django_db
@freeze_time("2026-05-02 06:00:00")
def test_non_holiday_clockin_no_grant(stack):
    org, replacement, shift_emp, _ = stack
    rec = AttendanceService.clock_in(employee=shift_emp, source="web")
    assert rec.is_holiday_work is False
    assert LeaveBalance.all_objects.filter(
        employee_id=shift_emp.id, leave_type=replacement,
    ).count() == 0
```

- [ ] **Step 2: Implement `apps/api/modules/attendance/services.py`**

```python
"""AttendanceService — clock-in / clock-out + status maintenance."""
from __future__ import annotations

import datetime
import uuid

from django.db import transaction
from django.utils import timezone

from modules.employee.models import Employee
from modules.schedule.services.holiday import HolidayService

from .models import AttendanceRecord
from .signals import attendance_clocked


class AttendanceService:
    @staticmethod
    @transaction.atomic
    def clock_in(
        *,
        employee: Employee,
        source: str = "web",
        ip: str | None = None,
        user_agent: str = "",
    ) -> AttendanceRecord:
        """Find-or-create today's record and stamp clock_in if not already set."""
        today = timezone.localdate()
        rec = AttendanceRecord.all_objects.filter(
            employee=employee, work_date=today, deleted_at__isnull=True,
        ).first()

        is_holiday_now = HolidayService.is_holiday(org_id=employee.org_id, on_date=today)
        holiday = HolidayService.get_for_date(org_id=employee.org_id, on_date=today) if is_holiday_now else None

        if rec is None:
            rec = AttendanceRecord.all_objects.create(
                org_id=employee.org_id, employee=employee, work_date=today,
                clock_in=timezone.now(),
                source=source, ip=ip, user_agent=user_agent[:512],
                is_holiday_work=is_holiday_now,
                holiday_id=holiday.id if holiday else None,
            )
        else:
            # idempotent: if clock_in already set, leave it alone
            if rec.clock_in is None:
                rec.clock_in = timezone.now()
                rec.source = source
                rec.ip = ip
                rec.user_agent = user_agent[:512]
                rec.is_holiday_work = is_holiday_now
                rec.holiday_id = holiday.id if holiday else None
                rec.save(update_fields=[
                    "clock_in", "source", "ip", "user_agent",
                    "is_holiday_work", "holiday_id", "updated_at",
                ])

        rec.recompute_status()
        rec.save(update_fields=["status", "updated_at"])

        attendance_clocked.send(sender=AttendanceRecord, record=rec, kind="in")
        return rec

    @staticmethod
    @transaction.atomic
    def clock_out(
        *,
        employee: Employee,
        source: str = "web",
        ip: str | None = None,
        user_agent: str = "",
    ) -> AttendanceRecord:
        today = timezone.localdate()
        rec = AttendanceRecord.all_objects.filter(
            employee=employee, work_date=today, deleted_at__isnull=True,
        ).first()
        if rec is None:
            rec = AttendanceRecord.all_objects.create(
                org_id=employee.org_id, employee=employee, work_date=today,
                clock_out=timezone.now(),
                source=source, ip=ip, user_agent=user_agent[:512],
            )
        else:
            rec.clock_out = timezone.now()
            rec.save(update_fields=["clock_out", "updated_at"])

        rec.recompute_status()
        rec.save(update_fields=["status", "updated_at"])

        attendance_clocked.send(sender=AttendanceRecord, record=rec, kind="out")
        return rec

    @staticmethod
    def today(*, employee: Employee) -> AttendanceRecord | None:
        today = timezone.localdate()
        return AttendanceRecord.all_objects.filter(
            employee=employee, work_date=today, deleted_at__isnull=True,
        ).first()
```

- [ ] **Step 3: Implement signals**

```python
"""attendance.attendance_clocked + handler that grants replacement leave for shift workers."""
from __future__ import annotations

from decimal import Decimal

from django.db.models.signals import Signal
from django.dispatch import receiver, Signal as DSignal


attendance_clocked = DSignal()  # kwargs: record, kind ("in" | "out")


@receiver(attendance_clocked)
def _on_clocked_grant_replacement(sender, record, kind, **kwargs) -> None:
    """When a SHIFT worker clocks in on a holiday, grant +1 REPLACEMENT leave.

    Idempotent: BalanceService keys on (reference_type, reference_id, reason).
    """
    if kind != "in":
        return
    if not record.is_holiday_work:
        return
    if record.employee.schedule_type != "shift":
        return

    # Find or skip if no REPLACEMENT type configured for this org.
    from modules.leave.models import LeaveType
    rep_type = LeaveType.all_objects.filter(
        org_id=record.org_id, code="REPLACEMENT", deleted_at__isnull=True,
    ).first()
    if rep_type is None:
        return

    from modules.leave.services.balance import BalanceService
    BalanceService.grant_replacement(
        org_id=record.org_id,
        employee_id=record.employee_id,
        leave_type=rep_type,
        year=record.work_date.year,
        days=Decimal("1"),
        reference_type="attendance_record",
        reference_id=record.id,
    )
```

- [ ] **Step 4: Run tests**

```
cd apps/api && uv run pytest modules/attendance/tests/test_clock_flow.py modules/attendance/tests/test_holiday_replacement.py -v 2>&1 | tail -15; cd ../..
```
Expected: 5 + 4 = 9 PASS.

- [ ] **Step 5: Commit Task 2**

```
git add apps/api/modules/attendance/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(attendance): clock-in/out service + holiday→replacement-leave signal (idempotent)"
```

---

## Task 3: Endpoints

**Files:**
- Create: `apps/api/modules/attendance/{serializers.py, views.py, urls.py, tests/test_endpoints.py}`
- Modify: `apps/api/hrms_api/urls.py`

- [ ] **Step 1: Serializers**

```python
"""Attendance serializers."""
from rest_framework import serializers

from .models import AttendanceRecord


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    computed_hours = serializers.FloatField(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ("id", "org_id", "employee", "employee_code", "work_date",
                  "clock_in", "clock_out", "computed_hours",
                  "source", "is_holiday_work", "holiday_id", "shift_assignment_id",
                  "status", "ip", "user_agent", "notes",
                  "created_at", "updated_at")
        read_only_fields = ("id", "org_id", "employee_code", "computed_hours",
                            "is_holiday_work", "holiday_id", "status",
                            "created_at", "updated_at")


class ClockSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
```

- [ ] **Step 2: Views**

```python
"""Attendance endpoints — clock-in/out, today, records, team."""
from __future__ import annotations

import datetime

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import AttendanceRecord
from .serializers import AttendanceRecordSerializer, ClockSerializer
from .services import AttendanceService


def _client_ip(request) -> str | None:
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ua(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "")[:512]


class AttendanceViewSet(viewsets.GenericViewSet):
    """Clock-in/out + today + records list."""

    serializer_class = AttendanceRecordSerializer
    permission_classes = [HRMSPermission]

    def get_queryset(self):
        return AttendanceRecord.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        ).select_related("employee")

    @property
    def required_perms(self):
        if self.action in ("clock_in", "clock_out"):
            return ["attendance:clock:self"]
        if self.action in ("today",):
            return ["attendance:read:self"]
        if self.action == "records":
            return ["attendance:read:self"]
        if self.action == "team":
            return ["attendance:read:team"]
        return []

    def _employee_for_user(self):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        if emp is None:
            raise NotFound("No employee profile linked to this user.")
        return emp

    @action(detail=False, methods=["post"], url_path="clock-in")
    def clock_in(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.clock_in(
            employee=emp, source="web",
            ip=_client_ip(request), user_agent=_ua(request),
        )
        return Response(self.get_serializer(rec).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="clock-out")
    def clock_out(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.clock_out(
            employee=emp, source="web",
            ip=_client_ip(request), user_agent=_ua(request),
        )
        return Response(self.get_serializer(rec).data)

    @action(detail=False, methods=["get"], url_path="today")
    def today(self, request):
        emp = self._employee_for_user()
        rec = AttendanceService.today(employee=emp)
        if rec is None:
            return Response({"clock_in": None, "clock_out": None, "status": "no_record"})
        return Response(self.get_serializer(rec).data)

    @action(detail=False, methods=["get"], url_path="records")
    def records(self, request):
        """List own attendance records, with optional from/to date filters."""
        emp = self._employee_for_user()
        qs = self.get_queryset().filter(employee=emp)
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return Response(self.get_serializer(qs.order_by("-work_date"), many=True).data)

    @action(detail=False, methods=["get"], url_path="team")
    def team(self, request):
        """Team view (manager): all attendance for direct reports + self on a date."""
        emp = self._employee_for_user()
        target_date = request.query_params.get("date") or datetime.date.today().isoformat()
        # Include self + direct reports
        report_ids = list(Employee.all_objects.filter(manager=emp).values_list("id", flat=True))
        emp_ids = report_ids + [emp.id]
        qs = self.get_queryset().filter(employee_id__in=emp_ids, work_date=target_date)
        return Response(self.get_serializer(qs.order_by("employee__employee_code"), many=True).data)
```

- [ ] **Step 3: URLs**

```python
from rest_framework.routers import DefaultRouter

from .views import AttendanceViewSet


router = DefaultRouter()
router.register(r"attendance", AttendanceViewSet, basename="attendance")
urlpatterns = router.urls
```

Modify `apps/api/hrms_api/urls.py`:
```python
    path("", include("modules.attendance.urls")),
```

- [ ] **Step 4: Endpoint integration tests**

`apps/api/modules/attendance/tests/test_endpoints.py`:

```python
"""Attendance endpoints integration tests."""
import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _login(client, email, password="x"):  # pragma: allowlist secret
    return client.post("/api/v1/auth/login", {"email": email, "password": password}, format="json").json()["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    emp_user = User.objects.create_user(email="e@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    mgr_user = User.objects.create_user(email="m@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    emp_role = Role.objects.create(org_id=org.id, code="employee", name="E", is_system=True)
    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="M", is_system=True)

    for code in ("attendance:clock:self", "attendance:read:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)
    for code in ("attendance:clock:self", "attendance:read:self", "attendance:read:team"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)

    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)
    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)

    def _emp(code, user, manager=None):
        return Employee.all_objects.create(
            org_id=org.id, user=user, employee_code=code,
            first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
            date_of_birth=datetime.date(1985, 1, 1), gender="other", nationality="MY",
            marital_status="single", address_line1="x", city="x", state="x",
            postcode="00000", country_code="MY", department=dept, manager=manager,
            role_title="x", employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1), bank_name="x",
            emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
        )

    mgr_emp = _emp("MGR", mgr_user)
    emp_emp = _emp("EMP", emp_user, manager=mgr_emp)

    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'e@x.com')}")
    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'm@x.com')}")
    return org, emp_client, mgr_client, emp_emp, mgr_emp


@pytest.mark.django_db
def test_clock_in_endpoint(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.post("/api/v1/attendance/clock-in/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["clock_in"] is not None
    assert body["status"] == "partial"


@pytest.mark.django_db
def test_clock_in_then_out(stack):
    _, emp_client, _, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = emp_client.post("/api/v1/attendance/clock-out/")
    assert resp.status_code == 200
    assert resp.json()["clock_out"] is not None
    assert resp.json()["status"] == "present"


@pytest.mark.django_db
def test_today_endpoint_returns_record_or_blank(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.get("/api/v1/attendance/today/")
    assert resp.status_code == 200
    body = resp.json()
    # Either no_record or a real record
    assert "status" in body


@pytest.mark.django_db
def test_records_returns_self_only(stack):
    _, emp_client, _, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = emp_client.get("/api/v1/attendance/records/")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)


@pytest.mark.django_db
def test_team_view_for_manager(stack):
    _, emp_client, mgr_client, _, _ = stack
    emp_client.post("/api/v1/attendance/clock-in/")
    resp = mgr_client.get("/api/v1/attendance/team/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_employee_cannot_view_team(stack):
    _, emp_client, _, _, _ = stack
    resp = emp_client.get("/api/v1/attendance/team/")
    assert resp.status_code == 403
```

- [ ] **Step 5: Run tests + regen contracts**

```
cd apps/api && uv run pytest modules/attendance/ -v 2>&1 | tail -10; cd ../..
sg docker -c 'make contracts' 2>&1 | tail -3
```

- [ ] **Step 6: Commit Task 3**

```
git add apps/api/modules/attendance/ apps/api/hrms_api/urls.py packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(attendance): /api/v1/attendance/{clock-in,clock-out,today,records,team} endpoints"
```

---

## M4b Acceptance Criteria

- [ ] AttendanceRecord migrated; unique on (employee, work_date)
- [ ] `AttendanceService.{clock_in, clock_out, today}` work and are idempotent
- [ ] Shift worker clocking in on a holiday → +1 REPLACEMENT leave (verified via tests)
- [ ] Fixed worker clocking in on a holiday → no replacement granted
- [ ] Re-clocking the same day = no double grant (idempotency on the ledger reference)
- [ ] Endpoints respect RBAC (employee can clock & read self, only managers see team)
- [ ] All M4b tests green; full backend suite green
- [ ] `manage.py check` clean
- [ ] Pre-commit clean

That is M4b. Next plan: **M4c — Frontend (roster grid + clock-in widget) + tag v0.1.0-m4**.
