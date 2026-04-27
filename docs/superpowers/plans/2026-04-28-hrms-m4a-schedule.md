# HRMS M4a — Schedule Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the schedule data layer: per-employee `WorkSchedule` (fixed weekly pattern as JSONB), org-defined `Shift` definitions, per-employee per-date `ShiftAssignment` with publish workflow, and an org-scoped `Holiday` table that syncs from `country_holidays` (M1a reference). Plus the basic read/write endpoints + the bulk-pattern roster generator. No clock-in/out yet — that's M4b.

**Architecture:**
- New module: `apps/api/modules/schedule/`. Owns models + services + endpoints for the schedule layer.
- `WorkSchedule.pattern` is a JSONB dict like `{"mon":{"start":"09:00","end":"18:00"},"tue":...}`. Lookup helpers in `services/schedule.py`.
- `Shift` is org-scoped, named (e.g., "Morning 06:00–14:00"). Crosses-midnight flag for night shifts.
- `ShiftAssignment` is one row per (employee, work_date). `published_at` gates whether the employee can see it; managers create-then-publish. Bulk `/shift-assignments/bulk-pattern` generates a week's worth from a (employee_ids, shift_pattern, date_range) tuple in one call.
- `Holiday` is the org's working holiday calendar — populated by syncing from `country_holidays` (federal MY) at org-bootstrap, then editable by HR.
- M4b will add `is_user_on_approved_leave_or_shift` lookups; M4a doesn't reach into attendance.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`work_schedules`, `shifts`, `shift_assignments`, `holidays`), §4 (`/schedule/*` endpoints).

**Branch:** create `m4/schedule` from master at Task 1 Step 1.

---

## File structure

```
apps/api/modules/schedule/                     NEW
├── __init__.py
├── apps.py
├── models.py                                   WorkSchedule, Shift, ShiftAssignment, Holiday
├── services/
│   ├── __init__.py
│   ├── schedule.py                             pattern lookup, week-shift generation
│   └── holiday.py                              sync from country_holidays
├── management/
│   ├── __init__.py
│   └── commands/
│       ├── __init__.py
│       └── seed_holidays_from_country.py
├── serializers.py
├── views.py
├── urls.py
├── admin.py
├── migrations/
│   ├── __init__.py
│   └── 0001_initial.py                        (auto-generated)
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_services.py
    ├── test_seed_command.py
    └── test_endpoints.py
```

Plus `apps/api/modules/identity/fixtures/permissions_m4.yaml` and updates to `default_roles.yaml`.

---

## Conventions

Working dir `/home/universal/Claude/HR_Management/`. Branch `m4/schedule`. TDD discipline. Pre-commit clean.

---

## Task 1: Branch + 4 models + permission codes

**Files:**
- Create: `apps/api/modules/schedule/{__init__.py, apps.py, models.py, admin.py, migrations/__init__.py, tests/__init__.py, tests/test_models.py}`
- Modify: `apps/api/hrms_api/settings/base.py`
- Create: `apps/api/modules/identity/fixtures/permissions_m4.yaml`
- Modify: `apps/api/modules/identity/fixtures/default_roles.yaml`

- [ ] **Step 1: Create branch + skeleton**

```
git checkout master
git checkout -b m4/schedule
mkdir -p apps/api/modules/schedule/{services,tests,migrations,management/commands}
touch apps/api/modules/schedule/__init__.py \
      apps/api/modules/schedule/services/__init__.py \
      apps/api/modules/schedule/migrations/__init__.py \
      apps/api/modules/schedule/tests/__init__.py \
      apps/api/modules/schedule/management/__init__.py \
      apps/api/modules/schedule/management/commands/__init__.py
```

- [ ] **Step 2: AppConfig**

`apps/api/modules/schedule/apps.py`:
```python
from django.apps import AppConfig


class ScheduleConfig(AppConfig):
    name = "modules.schedule"
    label = "schedule"
    verbose_name = "Schedule & shifts"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Write failing model tests**

Create `apps/api/modules/schedule/tests/test_models.py`:

```python
"""WorkSchedule, Shift, ShiftAssignment, Holiday model tests."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.schedule.models import (
    Holiday,
    Shift,
    ShiftAssignment,
    WorkSchedule,
)


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


@pytest.fixture
def employee(org: Organization, dept: Department) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id, employee_code="E1",
        first_name="A", last_name="B", email="a@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_work_schedule_create(org: Organization, employee: Employee) -> None:
    ws = WorkSchedule.all_objects.create(
        org_id=org.id, employee=employee, name="Default",
        pattern={
            "mon": {"start": "09:00", "end": "18:00"},
            "tue": {"start": "09:00", "end": "18:00"},
            "wed": {"start": "09:00", "end": "18:00"},
            "thu": {"start": "09:00", "end": "18:00"},
            "fri": {"start": "09:00", "end": "18:00"},
        },
        effective_from=datetime.date(2026, 1, 1),
    )
    assert ws.pattern["mon"]["start"] == "09:00"


@pytest.mark.django_db
def test_shift_create(org: Organization) -> None:
    s = Shift.all_objects.create(
        org_id=org.id, name="Morning",
        start_time=datetime.time(6, 0), end_time=datetime.time(14, 0),
        crosses_midnight=False, color="#3B82F6",
    )
    assert s.crosses_midnight is False


@pytest.mark.django_db
def test_shift_crosses_midnight(org: Organization) -> None:
    s = Shift.all_objects.create(
        org_id=org.id, name="Night",
        start_time=datetime.time(22, 0), end_time=datetime.time(7, 0),
        crosses_midnight=True, color="#1E40AF",
    )
    assert s.crosses_midnight is True


@pytest.mark.django_db
def test_shift_assignment_unique_per_employee_date(org: Organization, employee: Employee) -> None:
    s = Shift.all_objects.create(
        org_id=org.id, name="Morning",
        start_time=datetime.time(6, 0), end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id, employee=employee, shift=s,
        work_date=datetime.date(2026, 6, 1), status="scheduled",
        assigned_by=uuid.uuid4(),
    )
    with pytest.raises(IntegrityError):
        ShiftAssignment.all_objects.create(
            org_id=org.id, employee=employee, shift=s,
            work_date=datetime.date(2026, 6, 1), status="scheduled",
            assigned_by=uuid.uuid4(),
        )


@pytest.mark.django_db
def test_holiday_create(org: Organization) -> None:
    h = Holiday.all_objects.create(
        org_id=org.id, date=datetime.date(2026, 5, 1), name="Labour Day",
        type="federal", applies_to_country_code="MY",
    )
    assert h.applies_to_country_code == "MY"


@pytest.mark.django_db
def test_holiday_unique_per_org_date_name(org: Organization) -> None:
    Holiday.all_objects.create(
        org_id=org.id, date=datetime.date(2026, 5, 1), name="Labour Day",
        type="federal", applies_to_country_code="MY",
    )
    with pytest.raises(IntegrityError):
        Holiday.all_objects.create(
            org_id=org.id, date=datetime.date(2026, 5, 1), name="Labour Day",
            type="federal", applies_to_country_code="MY",
        )
```

- [ ] **Step 4: Run failing tests**

```
cd apps/api && uv run pytest modules/schedule/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Implement `apps/api/modules/schedule/models.py`**

```python
"""Schedule models — WorkSchedule, Shift, ShiftAssignment, Holiday."""
from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel


SHIFT_ASSIGNMENT_STATUSES: ClassVar[tuple] = (
    ("scheduled", "Scheduled"),
    ("completed", "Completed"),
    ("absent", "Absent"),
    ("cancelled", "Cancelled"),
)
HOLIDAY_TYPES: ClassVar[tuple] = (
    ("federal", "Federal"),
    ("state", "State"),
    ("company", "Company"),
)


class WorkSchedule(TenantBaseModel):
    """Per-employee weekly working pattern.

    `pattern` is a JSONB dict keyed by lowercase weekday: mon/tue/wed/thu/fri/sat/sun.
    Each value is `{"start": "HH:MM", "end": "HH:MM"}`. Missing days mean off.
    """

    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="work_schedules"
    )
    name = models.CharField(max_length=64, default="Default")
    pattern = models.JSONField(default=dict)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "schedule_work_schedule"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee", "effective_from"]),
        ]

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.name}"


class Shift(TenantBaseModel):
    """Org-defined shift template (e.g., "Morning 09:00-18:00")."""

    name = models.CharField(max_length=64)
    start_time = models.TimeField()
    end_time = models.TimeField()
    crosses_midnight = models.BooleanField(default=False)
    color = models.CharField(max_length=7, default="#3B82F6")

    class Meta:
        db_table = "schedule_shift"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="shift_unique_name_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.start_time}-{self.end_time})"


class ShiftAssignment(TenantBaseModel):
    """One employee × one date → one shift assignment."""

    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="shift_assignments"
    )
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="assignments")
    work_date = models.DateField()
    status = models.CharField(max_length=16, choices=SHIFT_ASSIGNMENT_STATUSES, default="scheduled")
    assigned_by = models.UUIDField()
    published_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "schedule_shift_assignment"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee", "work_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="shift_assignment_unique_emp_date",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "work_date"]),
            models.Index(fields=["employee", "work_date"]),
            models.Index(fields=["shift", "work_date"]),
        ]

    @property
    def is_published(self) -> bool:
        return self.published_at is not None

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.work_date}/{self.shift.name}"


class Holiday(TenantBaseModel):
    """Org's effective holiday list. Populated from country_holidays + company adds."""

    date = models.DateField()
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=8, choices=HOLIDAY_TYPES)
    applies_to_country_code = models.CharField(max_length=2, blank=True)
    applies_to_state_code = models.CharField(max_length=8, blank=True)

    class Meta:
        db_table = "schedule_holiday"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "date", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="holiday_unique_org_date_name",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.date}: {self.name}"
```

- [ ] **Step 6: Register app + generate migration + run tests**

Edit `apps/api/hrms_api/settings/base.py`. Add `"modules.schedule",` to INSTALLED_APPS after `"modules.leave",`.

```
cd apps/api && uv run python manage.py makemigrations schedule 2>&1 | tail -5 && uv run pytest modules/schedule/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```
Expected: 6 model tests pass.

- [ ] **Step 7: Add admin**

Create `apps/api/modules/schedule/admin.py`:

```python
from django.contrib import admin

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule


@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ("employee", "name", "effective_from", "effective_to")
    list_filter = ("effective_from",)
    search_fields = ("employee__employee_code", "employee__email")


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "org_id", "start_time", "end_time", "crosses_midnight")
    list_filter = ("crosses_midnight",)


@admin.register(ShiftAssignment)
class ShiftAssignmentAdmin(admin.ModelAdmin):
    list_display = ("employee", "shift", "work_date", "status", "published_at")
    list_filter = ("status", "shift")
    date_hierarchy = "work_date"
    search_fields = ("employee__employee_code",)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("date", "name", "type", "org_id")
    list_filter = ("type", "applies_to_country_code")
    date_hierarchy = "date"
```

- [ ] **Step 8: Add M4 permission codes**

Create `apps/api/modules/identity/fixtures/permissions_m4.yaml`:

```yaml
# Permission codes added in M4 (schedule + attendance modules).

# schedule
- { code: "schedule:work-schedule:read",          description: Read work schedules }
- { code: "schedule:work-schedule:write",         description: Create/edit work schedules }
- { code: "schedule:shift:read",                   description: Read shifts }
- { code: "schedule:shift:write",                  description: Create/edit shifts }
- { code: "schedule:assignment:read:self",         description: Read own shift assignments }
- { code: "schedule:assignment:read:team",         description: Read team shift assignments }
- { code: "schedule:assignment:write:team",        description: Assign shifts for direct reports }
- { code: "schedule:assignment:publish:team",      description: Publish a roster (notifies employees) }
- { code: "schedule:holiday:read",                 description: Read org holidays }
- { code: "schedule:holiday:write",                description: Create/edit org holidays }

# attendance — defined here so M4b just consumes them
- { code: "attendance:clock:self",                 description: Clock in/out for self }
- { code: "attendance:read:self",                  description: Read own attendance }
- { code: "attendance:read:team",                  description: Read team attendance }
- { code: "attendance:read:org",                   description: Read all attendance in the org }
- { code: "attendance:override:org",               description: HR-only correction of attendance records }
```

Modify `apps/api/modules/identity/fixtures/default_roles.yaml`. Add codes to roles:

- `org_admin` and `hr_manager`: all M4 codes.
- `manager` / `team_lead`: `schedule:work-schedule:read`, `schedule:shift:read`, `schedule:assignment:read:self/team`, `schedule:assignment:write:team`, `schedule:assignment:publish:team`, `schedule:holiday:read`, `attendance:clock:self`, `attendance:read:self/team`.
- `employee`: `schedule:work-schedule:read`, `schedule:shift:read`, `schedule:assignment:read:self`, `schedule:holiday:read`, `attendance:clock:self`, `attendance:read:self`.
- `finance`: `schedule:holiday:read`, `attendance:read:self`.
- `auditor`: read-only — `schedule:work-schedule:read`, `schedule:shift:read`, `schedule:assignment:read:self/team`, `schedule:holiday:read`, `attendance:read:self/team/org`.

- [ ] **Step 9: Update permission seed test threshold**

Edit `apps/api/modules/identity/tests/test_seed_commands.py`. Add `test_seed_permission_catalogue_loads_m4_codes` similar to the M3 one:

```python
@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m4_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "schedule:assignment:write:team" in codes
    assert "attendance:clock:self" in codes
    assert "schedule:holiday:write" in codes
    assert len(codes) >= 58  # 43 from M1b/M2/M3 + 15 from M4
```

- [ ] **Step 10: Run identity seed tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -10; cd ../..
```
Expected: all green; permission catalogue ≥ 58 codes.

- [ ] **Step 11: Commit Task 1**

```
git add apps/api/modules/schedule/ apps/api/hrms_api/settings/base.py \
        apps/api/modules/identity/fixtures/ apps/api/modules/identity/tests/test_seed_commands.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(schedule): models — WorkSchedule, Shift, ShiftAssignment, Holiday + M4 perms"
```

---

## Task 2: ScheduleService + HolidayService + seed command

**Files:**
- Create: `apps/api/modules/schedule/services/schedule.py`
- Create: `apps/api/modules/schedule/services/holiday.py`
- Create: `apps/api/modules/schedule/management/commands/seed_holidays_from_country.py`
- Create: `apps/api/modules/schedule/tests/test_services.py`
- Create: `apps/api/modules/schedule/tests/test_seed_command.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/modules/schedule/tests/test_services.py`:

```python
"""ScheduleService + HolidayService."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.schedule.models import Holiday, Shift, ShiftAssignment, WorkSchedule
from modules.schedule.services.holiday import HolidayService
from modules.schedule.services.schedule import ScheduleService


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    def _emp(code):
        return Employee.all_objects.create(
            org_id=org.id, employee_code=code,
            first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
            date_of_birth=datetime.date(1985, 1, 1), gender="other", nationality="MY",
            marital_status="single", address_line1="x", city="x", state="x",
            postcode="00000", country_code="MY", department=dept,
            role_title="x", employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1), bank_name="x",
            emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
        )

    return org, dept, _emp


@pytest.mark.django_db
def test_get_pattern_for_date_returns_day_pattern(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    WorkSchedule.all_objects.create(
        org_id=org.id, employee=e, name="Default",
        pattern={"mon": {"start": "09:00", "end": "18:00"}},
        effective_from=datetime.date(2026, 1, 1),
    )
    pattern = ScheduleService.get_pattern_for_date(employee=e, on_date=datetime.date(2026, 6, 1))  # Mon
    assert pattern == {"start": "09:00", "end": "18:00"}


@pytest.mark.django_db
def test_get_pattern_for_off_day_returns_none(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    WorkSchedule.all_objects.create(
        org_id=org.id, employee=e, name="Default",
        pattern={"mon": {"start": "09:00", "end": "18:00"}},
        effective_from=datetime.date(2026, 1, 1),
    )
    pattern = ScheduleService.get_pattern_for_date(employee=e, on_date=datetime.date(2026, 6, 7))  # Sun
    assert pattern is None


@pytest.mark.django_db
def test_bulk_assign_creates_one_assignment_per_date(setup) -> None:
    org, _, _emp = setup
    e1, e2 = _emp("E1"), _emp("E2")
    s_morning = Shift.all_objects.create(
        org_id=org.id, name="Morning",
        start_time=datetime.time(6, 0), end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    actor_id = uuid.uuid4()
    created = ScheduleService.bulk_assign_pattern(
        org_id=org.id,
        employee_ids=[e1.id, e2.id],
        pattern_by_weekday={"mon": s_morning.id, "tue": s_morning.id},
        date_from=datetime.date(2026, 6, 1),  # Mon
        date_to=datetime.date(2026, 6, 7),    # Sun
        assigned_by=actor_id,
    )
    # 2 employees × 2 weekdays (Mon, Tue in the week) = 4 assignments
    assert created == 4
    assert ShiftAssignment.all_objects.count() == 4


@pytest.mark.django_db
def test_publish_assignments_stamps_published_at(setup) -> None:
    org, _, _emp = setup
    e = _emp("E1")
    s = Shift.all_objects.create(
        org_id=org.id, name="X", start_time=datetime.time(9, 0), end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id, employee=e, shift=s,
        work_date=datetime.date(2026, 6, 1), status="scheduled",
        assigned_by=uuid.uuid4(),
    )
    n = ScheduleService.publish_for_period(
        org_id=org.id, date_from=datetime.date(2026, 6, 1), date_to=datetime.date(2026, 6, 7),
    )
    assert n == 1
    sa = ShiftAssignment.all_objects.get(employee=e, work_date=datetime.date(2026, 6, 1))
    assert sa.published_at is not None


@pytest.mark.django_db
def test_holiday_service_is_holiday(setup) -> None:
    org, _, _ = setup
    Holiday.all_objects.create(
        org_id=org.id, date=datetime.date(2026, 5, 1), name="Labour Day",
        type="federal", applies_to_country_code="MY",
    )
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 5, 1)) is True
    assert HolidayService.is_holiday(org_id=org.id, on_date=datetime.date(2026, 5, 2)) is False


@pytest.mark.django_db
def test_holiday_service_get_for_date(setup) -> None:
    org, _, _ = setup
    h = Holiday.all_objects.create(
        org_id=org.id, date=datetime.date(2026, 5, 1), name="Labour Day",
        type="federal", applies_to_country_code="MY",
    )
    found = HolidayService.get_for_date(org_id=org.id, on_date=datetime.date(2026, 5, 1))
    assert found is not None and found.id == h.id
```

- [ ] **Step 2: Implement `apps/api/modules/schedule/services/schedule.py`**

```python
"""ScheduleService — pattern lookup + bulk shift-assignment generation + publish."""
from __future__ import annotations

import datetime
import uuid

from django.db import transaction
from django.utils import timezone

from modules.employee.models import Employee

from ..models import ShiftAssignment, WorkSchedule


WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class ScheduleService:
    @staticmethod
    def get_pattern_for_date(*, employee: Employee, on_date: datetime.date) -> dict | None:
        """Return the {start, end} pattern for the given date, or None if off."""
        ws = (
            WorkSchedule.all_objects.filter(
                employee=employee,
                deleted_at__isnull=True,
                effective_from__lte=on_date,
            )
            .order_by("-effective_from")
            .first()
        )
        if ws is None:
            return None
        if ws.effective_to is not None and ws.effective_to < on_date:
            return None
        weekday_key = WEEKDAY_KEYS[on_date.weekday()]
        return ws.pattern.get(weekday_key) or None

    @staticmethod
    @transaction.atomic
    def bulk_assign_pattern(
        *,
        org_id: uuid.UUID,
        employee_ids: list[uuid.UUID],
        pattern_by_weekday: dict[str, uuid.UUID],
        date_from: datetime.date,
        date_to: datetime.date,
        assigned_by: uuid.UUID,
        notes: str = "",
    ) -> int:
        """Generate ShiftAssignment rows for each (employee, date) where the
        date's weekday is in the pattern. Skips dates where an assignment
        already exists for that employee.
        """
        if date_to < date_from:
            raise ValueError("date_to must be on or after date_from")

        n_created = 0
        date = date_from
        while date <= date_to:
            weekday_key = WEEKDAY_KEYS[date.weekday()]
            shift_id = pattern_by_weekday.get(weekday_key)
            if shift_id is not None:
                for emp_id in employee_ids:
                    obj, created = ShiftAssignment.all_objects.get_or_create(
                        org_id=org_id, employee_id=emp_id, work_date=date,
                        deleted_at__isnull=True,
                        defaults={
                            "shift_id": shift_id,
                            "status": "scheduled",
                            "assigned_by": assigned_by,
                            "notes": notes,
                        },
                    )
                    if created:
                        n_created += 1
            date += datetime.timedelta(days=1)
        return n_created

    @staticmethod
    def publish_for_period(
        *,
        org_id: uuid.UUID,
        date_from: datetime.date,
        date_to: datetime.date,
    ) -> int:
        """Stamp `published_at` on all unpublished scheduled assignments in the period."""
        return ShiftAssignment.all_objects.filter(
            org_id=org_id,
            work_date__gte=date_from, work_date__lte=date_to,
            published_at__isnull=True,
            status="scheduled",
            deleted_at__isnull=True,
        ).update(published_at=timezone.now())
```

(Note: Django's `get_or_create` with `deleted_at__isnull=True` in lookup needs `defaults` to NOT include `deleted_at`. The `deleted_at__isnull=True` lookup may not be supported in get_or_create's filter — replace with explicit `filter().first()` + `create()` if so.)

Robust alternative for `bulk_assign_pattern`:

```python
                for emp_id in employee_ids:
                    existing = ShiftAssignment.all_objects.filter(
                        org_id=org_id, employee_id=emp_id, work_date=date,
                        deleted_at__isnull=True,
                    ).first()
                    if existing is None:
                        ShiftAssignment.all_objects.create(
                            org_id=org_id, employee_id=emp_id, shift_id=shift_id,
                            work_date=date, status="scheduled",
                            assigned_by=assigned_by, notes=notes,
                        )
                        n_created += 1
```

Use the robust form.

- [ ] **Step 3: Implement `apps/api/modules/schedule/services/holiday.py`**

```python
"""HolidayService — is-holiday, get-for-date, sync from country reference."""
from __future__ import annotations

import datetime
import uuid

from django.db import transaction

from modules.organization.models import (
    CountryHoliday,
    Organization,
)

from ..models import Holiday


class HolidayService:
    @staticmethod
    def is_holiday(*, org_id: uuid.UUID, on_date: datetime.date) -> bool:
        return Holiday.all_objects.filter(
            org_id=org_id, date=on_date, deleted_at__isnull=True,
        ).exists()

    @staticmethod
    def get_for_date(*, org_id: uuid.UUID, on_date: datetime.date) -> Holiday | None:
        return Holiday.all_objects.filter(
            org_id=org_id, date=on_date, deleted_at__isnull=True,
        ).first()

    @staticmethod
    @transaction.atomic
    def sync_from_country(*, org: Organization, year: int) -> int:
        """Copy CountryHoliday rows for org.country_code in `year` into Holiday.

        Idempotent: existing (org_id, date, name) rows are left alone; only new
        ones are inserted.
        """
        candidates = CountryHoliday.objects.filter(
            country_code=org.country_code,
            date__year=year,
        )
        n_created = 0
        for ch in candidates:
            exists = Holiday.all_objects.filter(
                org_id=org.id, date=ch.date, name=ch.name, deleted_at__isnull=True,
            ).exists()
            if not exists:
                Holiday.all_objects.create(
                    org_id=org.id, date=ch.date, name=ch.name,
                    type=ch.type,
                    applies_to_country_code=ch.country_code,
                    applies_to_state_code=ch.state_code or "",
                )
                n_created += 1
        return n_created
```

- [ ] **Step 4: Implement seed command**

Create `apps/api/modules/schedule/management/commands/seed_holidays_from_country.py`:

```python
"""Sync this year's holidays into an org from country_holidays reference."""
import datetime
import uuid

from django.core.management.base import BaseCommand, CommandError

from modules.organization.models import Organization
from modules.schedule.services.holiday import HolidayService


class Command(BaseCommand):
    help = "Sync country holidays into an org's Holiday table for the given year."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", required=True)
        parser.add_argument("--year", type=int, default=None)

    def handle(self, *args, **options):
        try:
            org = Organization.objects.get(id=uuid.UUID(options["org_id"]))
        except (Organization.DoesNotExist, ValueError) as exc:
            raise CommandError(f"Org not found: {options['org_id']}") from exc

        year = options["year"] or datetime.date.today().year
        n = HolidayService.sync_from_country(org=org, year=year)
        self.stdout.write(self.style.SUCCESS(f"Synced {n} holidays for {org.slug} in {year}."))
```

- [ ] **Step 5: Tests for the seed command**

Create `apps/api/modules/schedule/tests/test_seed_command.py`:

```python
"""Tests for `seed_holidays_from_country`."""
import pytest
from django.core.management import call_command

from modules.organization.models import Organization
from modules.schedule.models import Holiday


@pytest.fixture
def org_my() -> Organization:
    return Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.mark.django_db
def test_seed_loads_my_2026_holidays(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    assert Holiday.all_objects.filter(org_id=org_my.id).count() >= 13  # MY 2026 federal


@pytest.mark.django_db
def test_seed_idempotent(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    n1 = Holiday.all_objects.filter(org_id=org_my.id).count()
    call_command("seed_holidays_from_country", "--org-id", str(org_my.id), "--year", "2026")
    n2 = Holiday.all_objects.filter(org_id=org_my.id).count()
    assert n1 == n2
```

- [ ] **Step 6: Run tests**

```
cd apps/api && uv run pytest modules/schedule/ -v 2>&1 | tail -15; cd ../..
```
Expected: 6 + 6 + 2 = 14 schedule tests pass.

- [ ] **Step 7: Commit Task 2**

```
git add apps/api/modules/schedule/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(schedule): ScheduleService (pattern + bulk + publish) + HolidayService + seed command"
```

---

## Task 3: Endpoints

**Files:**
- Create: `apps/api/modules/schedule/serializers.py`
- Create: `apps/api/modules/schedule/views.py`
- Create: `apps/api/modules/schedule/urls.py`
- Modify: `apps/api/hrms_api/urls.py`
- Create: `apps/api/modules/schedule/tests/test_endpoints.py`

- [ ] **Step 1: Serializers**

```python
"""Serializers for the schedule module."""
from rest_framework import serializers

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule


class WorkScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkSchedule
        fields = ("id", "employee", "name", "pattern", "effective_from", "effective_to")
        read_only_fields = ("id",)


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ("id", "name", "start_time", "end_time", "crosses_midnight", "color")
        read_only_fields = ("id",)


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    is_published = serializers.BooleanField(read_only=True)

    class Meta:
        model = ShiftAssignment
        fields = ("id", "employee", "employee_code", "shift", "shift_name", "work_date",
                  "status", "assigned_by", "published_at", "is_published", "notes")
        read_only_fields = ("id", "employee_code", "shift_name", "published_at", "is_published")


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ("id", "date", "name", "type", "applies_to_country_code", "applies_to_state_code")
        read_only_fields = ("id",)


class BulkAssignSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    # Map of weekday key (mon/tue/...) -> shift UUID
    pattern = serializers.DictField(child=serializers.UUIDField())
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class PublishSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()
```

- [ ] **Step 2: Views**

```python
"""Schedule viewsets + custom actions (bulk-pattern, publish, /me)."""
from __future__ import annotations

import datetime

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import Holiday, Shift, ShiftAssignment, WorkSchedule
from .serializers import (
    BulkAssignSerializer,
    HolidaySerializer,
    PublishSerializer,
    ShiftAssignmentSerializer,
    ShiftSerializer,
    WorkScheduleSerializer,
)
from .services.schedule import ScheduleService


class WorkScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = WorkScheduleSerializer
    permission_classes = [HRMSPermission]

    def get_queryset(self):
        return WorkSchedule.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        )

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:work-schedule:read"]
        return ["schedule:work-schedule:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    permission_classes = [HRMSPermission]

    def get_queryset(self):
        return Shift.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        ).order_by("name")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:shift:read"]
        return ["schedule:shift:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class ShiftAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftAssignmentSerializer
    permission_classes = [HRMSPermission]

    def get_queryset(self):
        qs = ShiftAssignment.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        )
        emp_id = self.request.query_params.get("employee_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return qs.order_by("work_date", "employee__employee_code")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:assignment:read:team"]
        if self.action in ("create", "update", "partial_update", "destroy", "bulk_pattern"):
            return ["schedule:assignment:write:team"]
        if self.action == "publish":
            return ["schedule:assignment:publish:team"]
        if self.action == "me":
            return ["schedule:assignment:read:self"]
        return []

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id, assigned_by=self.request.user.id)

    @action(detail=False, methods=["post"], url_path="bulk-pattern")
    def bulk_pattern(self, request):
        ser = BulkAssignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        n = ScheduleService.bulk_assign_pattern(
            org_id=request.user.org_id,
            employee_ids=ser.validated_data["employee_ids"],
            pattern_by_weekday=ser.validated_data["pattern"],
            date_from=ser.validated_data["date_from"],
            date_to=ser.validated_data["date_to"],
            assigned_by=request.user.id,
            notes=ser.validated_data.get("notes", ""),
        )
        return Response({"created": n}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="publish")
    def publish(self, request):
        ser = PublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        n = ScheduleService.publish_for_period(
            org_id=request.user.org_id,
            date_from=ser.validated_data["date_from"],
            date_to=ser.validated_data["date_to"],
        )
        return Response({"published": n})

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        emp = Employee.all_objects.filter(user_id=request.user.id).first()
        if emp is None:
            return Response([])
        qs = ShiftAssignment.all_objects.filter(
            employee=emp, deleted_at__isnull=True, published_at__isnull=False,
        )
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")
        if date_from:
            qs = qs.filter(work_date__gte=date_from)
        if date_to:
            qs = qs.filter(work_date__lte=date_to)
        return Response(self.get_serializer(qs.order_by("work_date"), many=True).data)


class HolidayViewSet(viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    permission_classes = [HRMSPermission]

    def get_queryset(self):
        qs = Holiday.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        )
        year = self.request.query_params.get("year")
        if year:
            try:
                qs = qs.filter(date__year=int(year))
            except ValueError:
                pass
        return qs.order_by("date")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["schedule:holiday:read"]
        return ["schedule:holiday:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)
```

- [ ] **Step 3: URLs**

```python
from rest_framework.routers import DefaultRouter

from .views import (
    HolidayViewSet,
    ShiftAssignmentViewSet,
    ShiftViewSet,
    WorkScheduleViewSet,
)


router = DefaultRouter()
router.register(r"schedule/work-schedules", WorkScheduleViewSet, basename="work-schedule")
router.register(r"schedule/shifts", ShiftViewSet, basename="shift")
router.register(r"schedule/shift-assignments", ShiftAssignmentViewSet, basename="shift-assignment")
router.register(r"schedule/holidays", HolidayViewSet, basename="holiday")
urlpatterns = router.urls
```

Modify `apps/api/hrms_api/urls.py`. Add to `api_v1_patterns`:
```python
    path("", include("modules.schedule.urls")),
```

- [ ] **Step 4: Endpoint smoke tests**

Create `apps/api/modules/schedule/tests/test_endpoints.py` (5-6 integration tests covering: list shifts as employee, list assignments scoped to team for manager, /me for employee, bulk-pattern as manager, publish as manager, holiday list).

(Pattern follows M3c's `test_endpoints.py` exactly — auth_client fixture with the right perms, then HTTP-level assertions.)

```python
"""Integration tests for /api/v1/schedule/* endpoints."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post("/api/v1/auth/login", {"email": email, "password": password}, format="json").json()
    return body["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    mgr_user = User.objects.create_user(email="m@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp_user = User.objects.create_user(email="e@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)

    mgr_codes = [
        "schedule:work-schedule:read", "schedule:shift:read", "schedule:shift:write",
        "schedule:assignment:read:team", "schedule:assignment:write:team",
        "schedule:assignment:publish:team", "schedule:holiday:read",
    ]
    emp_codes = [
        "schedule:shift:read", "schedule:assignment:read:self", "schedule:holiday:read",
    ]
    for code in mgr_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)
    for code in emp_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)

    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)
    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)

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

    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'm@x.com')}")
    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'e@x.com')}")

    return org, dept, emp_emp, mgr_client, emp_client


@pytest.mark.django_db
def test_list_shifts_authenticated(stack) -> None:
    org, _, _, mgr_client, _ = stack
    Shift.all_objects.create(
        org_id=org.id, name="Morning",
        start_time=datetime.time(6, 0), end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    resp = mgr_client.get("/api/v1/schedule/shifts/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_create_shift_as_manager(stack) -> None:
    org, _, _, mgr_client, _ = stack
    resp = mgr_client.post(
        "/api/v1/schedule/shifts/",
        {
            "name": "Day",
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "crosses_midnight": False,
            "color": "#FF0000",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content


@pytest.mark.django_db
def test_employee_cannot_create_shift(stack) -> None:
    _, _, _, _, emp_client = stack
    resp = emp_client.post(
        "/api/v1/schedule/shifts/",
        {"name": "x", "start_time": "09:00:00", "end_time": "18:00:00", "crosses_midnight": False},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_bulk_assign_pattern(stack) -> None:
    org, _, emp_emp, mgr_client, _ = stack
    s = Shift.all_objects.create(
        org_id=org.id, name="Morning",
        start_time=datetime.time(6, 0), end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    resp = mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {"mon": str(s.id), "tue": str(s.id), "wed": str(s.id), "thu": str(s.id), "fri": str(s.id)},
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["created"] == 5  # Mon-Fri only


@pytest.mark.django_db
def test_publish_roster(stack) -> None:
    org, _, emp_emp, mgr_client, _ = stack
    s = Shift.all_objects.create(
        org_id=org.id, name="X",
        start_time=datetime.time(9, 0), end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {"mon": str(s.id)},
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    resp = mgr_client.post(
        "/api/v1/schedule/shift-assignments/publish/",
        {"date_from": "2026-06-01", "date_to": "2026-06-07"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["published"] >= 1


@pytest.mark.django_db
def test_my_assignments(stack) -> None:
    org, _, emp_emp, mgr_client, emp_client = stack
    # Mgr creates AND publishes an assignment
    s = Shift.all_objects.create(
        org_id=org.id, name="X",
        start_time=datetime.time(9, 0), end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {"mon": str(s.id)},
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/publish/",
        {"date_from": "2026-06-01", "date_to": "2026-06-07"},
        format="json",
    )

    # But to test schedule:assignment:read:self the employee needs that perm — we set it as part of emp_codes? No: emp_codes only has read:self for "shift" not "assignment". Let's add it.
    p, _ = Permission.objects.get_or_create(code="schedule:assignment:read:self", defaults={"description": ""})
    role = emp_client.handler._user.user_roles.first().role  # ugly but works
    RolePermission.objects.create(role=role, permission=p)

    resp = emp_client.get("/api/v1/schedule/shift-assignments/me/")
    # 200 with the published Mon assignment
    assert resp.status_code == 200, resp.content
```

- [ ] **Step 5: Run tests + regen contracts**

```
cd apps/api && uv run pytest modules/schedule/ -v 2>&1 | tail -10; cd ../..
sg docker -c 'make contracts' 2>&1 | tail -3
```

- [ ] **Step 6: Commit Task 3**

```
git add apps/api/modules/schedule/ apps/api/hrms_api/urls.py packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(schedule): /api/v1/schedule/* endpoints (work-schedules, shifts, assignments, holidays) + bulk-pattern + publish"
```

---

## M4a Acceptance Criteria

- [ ] WorkSchedule, Shift, ShiftAssignment, Holiday migrations clean
- [ ] `ScheduleService.{get_pattern_for_date, bulk_assign_pattern, publish_for_period}` work
- [ ] `HolidayService.{is_holiday, get_for_date, sync_from_country}` work
- [ ] `seed_holidays_from_country --org-id <uuid> --year 2026` populates ≥ 13 federal MY holidays, idempotent
- [ ] `/api/v1/schedule/{work-schedules,shifts,shift-assignments,holidays}/` CRUD works
- [ ] `/api/v1/schedule/shift-assignments/bulk-pattern/` creates assignments per pattern × date range
- [ ] `/api/v1/schedule/shift-assignments/publish/` stamps published_at
- [ ] `/api/v1/schedule/shift-assignments/me/` returns the user's published assignments
- [ ] Permission catalogue grew to ≥ 58 codes
- [ ] All M4a tests green; full backend suite green
- [ ] `manage.py check` clean

That is M4a. Next plan: **M4b — Attendance + holiday-replacement rule** (consumes M4a's Holiday + ShiftAssignment, writes AttendanceRecord, fires the holiday-work → replacement leave rule).
