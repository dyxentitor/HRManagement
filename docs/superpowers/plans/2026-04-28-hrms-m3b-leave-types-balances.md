# HRMS M3b — Leave Types, Policies, Balances, Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **data layer** for leave: types (per-org configurable), policies (entitled-days rules with tenure brackets), balances (per-employee per-type per-year), and an append-only `leave_balance_ledger` that records every delta. Plus a seed command to bootstrap an org's leave types from `country_leave_type_defaults` (M1a). No request workflow yet — that's M3c.

**Architecture:**
- New module: `apps/api/modules/leave/`. Owns models + services for the data layer only.
- `LeaveBalance` columns: `entitled` (set by policy), `accrued` (cumulative this year), `taken` (deducted on approve), `pending` (held during submitted-state requests), `available` is a generated column = `accrued + carried_forward - taken - pending`. `carried_forward` is set at year rollover.
- `LeaveBalanceLedger` is append-only (no DB trigger this milestone — Phase 2 if needed). All writes go through `LeaveLedgerService.append`. Idempotency: `(reference_type, reference_id, reason)` is unique.
- Tenure brackets: a JSONB list like `[{"min_years": 0, "days": 14}, {"min_years": 5, "days": 18}]`. The service computes the entitlement at policy-apply time, not on every read.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`leave_types`, `leave_policies`, `leave_balances`, `leave_balance_ledger`).

**Branch:** `m3/workflow` (current). Stay on it; M3b builds on top of M3a.

---

## File structure

```
apps/api/modules/leave/                       NEW
├── __init__.py
├── apps.py
├── models.py                                  LeaveType, LeavePolicy, LeaveBalance, LeaveBalanceLedger
├── services/
│   ├── __init__.py
│   ├── ledger.py                              LeaveLedgerService (append)
│   ├── balance.py                             BalanceService (get / recompute / accrue / carry-forward)
│   └── policy.py                              PolicyService (find applicable policy, compute entitled days)
├── management/
│   ├── __init__.py
│   └── commands/
│       ├── __init__.py
│       └── seed_leave_types_from_country.py
├── migrations/
│   ├── __init__.py
│   └── 0001_initial.py
├── admin.py
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_ledger.py
    ├── test_balance.py
    ├── test_policy.py
    └── test_seed_command.py
```

---

## Conventions

Same as M3a. Branch: `m3/workflow`. TDD discipline. Pre-commit clean.

---

## Task 1: Module skeleton + models

**Files:**
- Create: `apps/api/modules/leave/__init__.py`
- Create: `apps/api/modules/leave/apps.py`
- Create: `apps/api/modules/leave/models.py`
- Create: `apps/api/modules/leave/admin.py`
- Create: `apps/api/modules/leave/migrations/__init__.py`
- Create: `apps/api/modules/leave/tests/__init__.py`
- Create: `apps/api/modules/leave/tests/test_models.py`
- Modify: `apps/api/hrms_api/settings/base.py` (register `modules.leave`)

- [ ] **Step 1: Create package skeleton**

```
mkdir -p apps/api/modules/leave/{services,tests,migrations,management/commands}
touch apps/api/modules/leave/__init__.py \
      apps/api/modules/leave/services/__init__.py \
      apps/api/modules/leave/migrations/__init__.py \
      apps/api/modules/leave/tests/__init__.py \
      apps/api/modules/leave/management/__init__.py \
      apps/api/modules/leave/management/commands/__init__.py
```

- [ ] **Step 2: AppConfig**

`apps/api/modules/leave/apps.py`:
```python
from django.apps import AppConfig


class LeaveConfig(AppConfig):
    name = "modules.leave"
    label = "leave"
    verbose_name = "Leave management"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Write failing model tests**

Create `apps/api/modules/leave/tests/test_models.py`:

```python
"""LeaveType, LeavePolicy, LeaveBalance, LeaveBalanceLedger models."""
import datetime
from decimal import Decimal

import pytest
from django.db import IntegrityError

from modules.leave.models import (
    LeaveBalance,
    LeaveBalanceLedger,
    LeavePolicy,
    LeaveType,
)
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.mark.django_db
def test_leave_type_basic(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual Leave",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    assert lt.code == "ANNUAL"
    assert lt.is_paid is True


@pytest.mark.django_db
def test_leave_type_code_unique_per_org(org: Organization) -> None:
    LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    with pytest.raises(IntegrityError):
        LeaveType.all_objects.create(
            org_id=org.id, code="ANNUAL", name="Dup",
            accrual_type="annual", default_days=Decimal("10"),
            is_paid=True, is_statutory=False, gender_restriction="any",
        )


@pytest.mark.django_db
def test_leave_policy_with_tenure_brackets(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    p = LeavePolicy.all_objects.create(
        org_id=org.id, leave_type=lt,
        days_per_year=Decimal("14"),
        tenure_brackets=[
            {"min_years": 0, "days": 14},
            {"min_years": 2, "days": 18},
            {"min_years": 5, "days": 21},
        ],
        effective_from=datetime.date(2026, 1, 1),
    )
    assert len(p.tenure_brackets) == 3
    assert p.effective_to is None  # open-ended


@pytest.mark.django_db
def test_leave_balance_unique_per_employee_type_year(org: Organization) -> None:
    import uuid
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    emp_id = uuid.uuid4()
    LeaveBalance.all_objects.create(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        entitled=Decimal("14"), accrued=Decimal("14"),
        taken=Decimal("0"), pending=Decimal("0"), carried_forward=Decimal("0"),
    )
    with pytest.raises(IntegrityError):
        LeaveBalance.all_objects.create(
            org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
            entitled=Decimal("10"), accrued=Decimal("10"),
            taken=Decimal("0"), pending=Decimal("0"), carried_forward=Decimal("0"),
        )


@pytest.mark.django_db
def test_leave_balance_ledger_append(org: Organization) -> None:
    import uuid
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    row = LeaveBalanceLedger.objects.create(
        org_id=org.id, employee_id=uuid.uuid4(), leave_type=lt,
        delta=Decimal("14"), reason="accrual",
    )
    assert row.delta == Decimal("14")
    assert row.reference_type is None


@pytest.mark.django_db
def test_leave_balance_ledger_idempotent_per_reference(org: Organization) -> None:
    import uuid
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="REPLACEMENT", name="Replacement",
        accrual_type="event_based", default_days=Decimal("0"),
        is_paid=True, is_statutory=False, gender_restriction="any",
    )
    emp_id = uuid.uuid4()
    ref_id = uuid.uuid4()
    LeaveBalanceLedger.objects.create(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("1"), reason="holiday_replacement",
        reference_type="attendance_record", reference_id=ref_id,
    )
    with pytest.raises(IntegrityError):
        LeaveBalanceLedger.objects.create(
            org_id=org.id, employee_id=emp_id, leave_type=lt,
            delta=Decimal("1"), reason="holiday_replacement",
            reference_type="attendance_record", reference_id=ref_id,
        )
```

- [ ] **Step 4: Run failing tests**

```
cd apps/api && uv run pytest modules/leave/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Implement `apps/api/modules/leave/models.py`**

```python
"""Leave data layer: types, policies, balances, ledger."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel


ACCRUAL_TYPES: ClassVar[tuple] = (
    ("annual", "Annual"),
    ("monthly", "Monthly"),
    ("event_based", "Event-based"),
    ("none", "No accrual"),
)
GENDER_RESTRICTION_CHOICES: ClassVar[tuple] = (
    ("any", "Any"),
    ("male", "Male only"),
    ("female", "Female only"),
)
LEDGER_REASONS: ClassVar[tuple] = (
    ("accrual", "Accrual"),
    ("request_approved", "Request approved"),
    ("request_cancelled", "Request cancelled"),
    ("carry_forward", "Carry forward"),
    ("holiday_replacement", "Holiday replacement"),
    ("manual_adjustment", "Manual adjustment"),
)


class LeaveType(TenantBaseModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=64)
    accrual_type = models.CharField(max_length=16, choices=ACCRUAL_TYPES)
    default_days = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    is_paid = models.BooleanField(default=True)
    requires_attachment = models.BooleanField(default=False)
    max_consecutive_days = models.IntegerField(null=True, blank=True)
    min_advance_notice_days = models.IntegerField(default=0)
    carry_forward_max = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    is_statutory = models.BooleanField(default=False)
    gender_restriction = models.CharField(max_length=8, choices=GENDER_RESTRICTION_CHOICES, default="any")

    class Meta:
        db_table = "leave_type"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="leave_type_unique_code_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class LeavePolicy(TenantBaseModel):
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="policies")
    applies_to_role_id = models.UUIDField(null=True, blank=True)
    applies_to_department_id = models.UUIDField(null=True, blank=True)
    days_per_year = models.DecimalField(max_digits=5, decimal_places=2)
    tenure_brackets = models.JSONField(default=list, blank=True)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "leave_policy"
        indexes: ClassVar[list] = [
            models.Index(fields=["leave_type", "effective_from"]),
        ]

    def __str__(self) -> str:
        return f"Policy({self.leave_type.code}, {self.days_per_year}d/y)"


class LeaveBalance(TenantBaseModel):
    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="balances")
    year = models.IntegerField()
    entitled = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    accrued = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    taken = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    pending = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    carried_forward = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "leave_balance"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee_id", "leave_type", "year"],
                condition=models.Q(deleted_at__isnull=True),
                name="leave_balance_unique_emp_type_year",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "year"]),
        ]

    @property
    def available(self) -> Decimal:
        return self.accrued + self.carried_forward - self.taken - self.pending

    def __str__(self) -> str:
        return f"{self.employee_id}/{self.leave_type.code}/{self.year}"


class LeaveBalanceLedger(models.Model):
    """Append-only ledger of every change to a leave balance.

    Idempotency: (reference_type, reference_id, reason) is unique. Re-running
    an event-driven grant (e.g., HolidayWorkConfirmed) is a no-op.
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="ledger_entries")
    delta = models.DecimalField(max_digits=6, decimal_places=2)
    reason = models.CharField(max_length=32, choices=LEDGER_REASONS)
    reference_type = models.CharField(max_length=64, null=True, blank=True)
    reference_id = models.UUIDField(null=True, blank=True)
    actor_id = models.UUIDField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "leave_balance_ledger"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["reference_type", "reference_id", "reason"],
                condition=~models.Q(reference_type=None) & ~models.Q(reference_id=None),
                name="leave_ledger_unique_per_reference",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "leave_type", "-ts"]),
        ]

    def __str__(self) -> str:
        return f"{self.employee_id}/{self.leave_type.code}/{self.delta}/{self.reason}"
```

- [ ] **Step 6: Register app + migration + admin + tests**

Edit `apps/api/hrms_api/settings/base.py`. Add `"modules.leave",` to INSTALLED_APPS after `"modules.employee",`.

```
cd apps/api && uv run python manage.py makemigrations leave 2>&1 | tail -5 && uv run pytest modules/leave/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```
Expected: `0001_initial.py` created. 6 model tests pass.

Create `apps/api/modules/leave/admin.py`:

```python
from django.contrib import admin

from .models import LeaveBalance, LeaveBalanceLedger, LeavePolicy, LeaveType


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "org_id", "accrual_type", "is_paid", "is_statutory")
    list_filter = ("accrual_type", "is_paid", "is_statutory", "gender_restriction")
    search_fields = ("code", "name")


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = ("leave_type", "org_id", "days_per_year", "effective_from", "effective_to")
    list_filter = ("leave_type",)


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "leave_type", "year", "entitled", "accrued", "taken", "pending")
    list_filter = ("year", "leave_type")
    search_fields = ("employee_id",)


@admin.register(LeaveBalanceLedger)
class LeaveBalanceLedgerAdmin(admin.ModelAdmin):
    list_display = ("ts", "employee_id", "leave_type", "delta", "reason", "reference_type")
    list_filter = ("reason", "leave_type")
    search_fields = ("employee_id",)
    readonly_fields = ("ts",)
```

- [ ] **Step 7: Commit Task 1**

```
git add apps/api/modules/leave/ apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): models — types, policies, balances, balance-ledger (append-only)"
```

---

## Task 2: LedgerService + BalanceService

**Files:**
- Create: `apps/api/modules/leave/services/ledger.py`
- Create: `apps/api/modules/leave/services/balance.py`
- Create: `apps/api/modules/leave/tests/test_ledger.py`
- Create: `apps/api/modules/leave/tests/test_balance.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/modules/leave/tests/test_ledger.py`:

```python
"""LeaveLedgerService.append idempotency + balance recompute."""
import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveBalanceLedger, LeaveType
from modules.leave.services.ledger import LeaveLedgerService
from modules.organization.models import Organization


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    return org, lt, uuid.uuid4()


@pytest.mark.django_db
def test_append_creates_ledger_row(setup) -> None:
    org, lt, emp_id = setup
    row = LeaveLedgerService.append(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("14"), reason="accrual",
    )
    assert row.id is not None
    assert row.delta == Decimal("14")


@pytest.mark.django_db
def test_append_with_reference_idempotent(setup) -> None:
    org, lt, emp_id = setup
    ref_id = uuid.uuid4()
    r1 = LeaveLedgerService.append(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("1"), reason="holiday_replacement",
        reference_type="attendance_record", reference_id=ref_id,
    )
    r2 = LeaveLedgerService.append(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("1"), reason="holiday_replacement",
        reference_type="attendance_record", reference_id=ref_id,
    )
    assert r1.id == r2.id  # second call returns the existing row
    assert LeaveBalanceLedger.objects.count() == 1


@pytest.mark.django_db
def test_append_without_reference_creates_distinct_rows(setup) -> None:
    """Manual adjustments (no reference) are NOT idempotent."""
    org, lt, emp_id = setup
    LeaveLedgerService.append(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("1"), reason="manual_adjustment",
    )
    LeaveLedgerService.append(
        org_id=org.id, employee_id=emp_id, leave_type=lt,
        delta=Decimal("2"), reason="manual_adjustment",
    )
    assert LeaveBalanceLedger.objects.count() == 2
```

Create `apps/api/modules/leave/tests/test_balance.py`:

```python
"""BalanceService — recompute, accrue, hold, release, deduct."""
import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveBalance, LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Organization


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    return org, lt, uuid.uuid4()


@pytest.mark.django_db
def test_get_or_create_creates_zero_balance(setup) -> None:
    org, lt, emp_id = setup
    bal = BalanceService.get_or_create(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026)
    assert bal.entitled == Decimal("0")
    assert bal.accrued == Decimal("0")
    assert bal.available == Decimal("0")


@pytest.mark.django_db
def test_accrue_increments_accrued_and_appends_ledger(setup) -> None:
    org, lt, emp_id = setup
    bal = BalanceService.accrue(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("14"), reason="accrual",
    )
    assert bal.accrued == Decimal("14")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_hold_pending_reduces_available(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
                         days=Decimal("14"), reason="accrual")
    bal = BalanceService.hold_pending(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("3"),
    )
    assert bal.pending == Decimal("3")
    assert bal.available == Decimal("11")


@pytest.mark.django_db
def test_deduct_moves_pending_to_taken(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
                         days=Decimal("14"), reason="accrual")
    BalanceService.hold_pending(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
                                days=Decimal("3"))
    ref_id = uuid.uuid4()
    bal = BalanceService.deduct(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("3"),
        reference_type="leave_request", reference_id=ref_id,
    )
    assert bal.pending == Decimal("0")
    assert bal.taken == Decimal("3")
    assert bal.available == Decimal("11")


@pytest.mark.django_db
def test_release_pending_restores_available(setup) -> None:
    org, lt, emp_id = setup
    BalanceService.accrue(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
                         days=Decimal("14"), reason="accrual")
    BalanceService.hold_pending(org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
                                days=Decimal("3"))
    bal = BalanceService.release_pending(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("3"),
    )
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_grant_replacement_idempotent_per_reference(setup) -> None:
    """The HolidayWorkConfirmed replacement-grant is idempotent on (ref_type, ref_id, reason)."""
    org, lt, emp_id = setup
    ref_id = uuid.uuid4()
    bal1 = BalanceService.grant_replacement(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("1"),
        reference_type="attendance_record", reference_id=ref_id,
    )
    bal2 = BalanceService.grant_replacement(
        org_id=org.id, employee_id=emp_id, leave_type=lt, year=2026,
        days=Decimal("1"),
        reference_type="attendance_record", reference_id=ref_id,
    )
    assert bal1.accrued == bal2.accrued == Decimal("1")  # not 2
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest modules/leave/tests/test_ledger.py modules/leave/tests/test_balance.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Implement `apps/api/modules/leave/services/ledger.py`**

```python
"""LeaveLedgerService — append-only writes with reference-based idempotency."""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction

from modules.leave.models import LeaveBalanceLedger, LeaveType


class LeaveLedgerService:
    @staticmethod
    @transaction.atomic
    def append(
        *,
        org_id: uuid.UUID,
        employee_id: uuid.UUID,
        leave_type: LeaveType,
        delta: Decimal,
        reason: str,
        reference_type: str | None = None,
        reference_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalanceLedger:
        """Append a ledger row.

        If `reference_type + reference_id` is provided AND a row already exists
        for that (reference_type, reference_id, reason) tuple, return that
        existing row instead of inserting (idempotency).
        """
        if reference_type is not None and reference_id is not None:
            existing = LeaveBalanceLedger.objects.filter(
                reference_type=reference_type,
                reference_id=reference_id,
                reason=reason,
            ).first()
            if existing is not None:
                return existing

        try:
            return LeaveBalanceLedger.objects.create(
                org_id=org_id, employee_id=employee_id, leave_type=leave_type,
                delta=delta, reason=reason,
                reference_type=reference_type, reference_id=reference_id,
                actor_id=actor_id,
            )
        except IntegrityError:
            # Race: another transaction inserted just now. Return the existing row.
            if reference_type is not None and reference_id is not None:
                return LeaveBalanceLedger.objects.get(
                    reference_type=reference_type,
                    reference_id=reference_id,
                    reason=reason,
                )
            raise
```

- [ ] **Step 4: Implement `apps/api/modules/leave/services/balance.py`**

```python
"""BalanceService — orchestrates LeaveBalance updates + ledger appends."""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import transaction

from modules.leave.models import LeaveBalance, LeaveType
from modules.leave.services.ledger import LeaveLedgerService


class BalanceService:
    @staticmethod
    @transaction.atomic
    def get_or_create(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int,
    ) -> LeaveBalance:
        bal, _ = LeaveBalance.objects.get_or_create(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
            defaults={
                "entitled": Decimal("0"), "accrued": Decimal("0"),
                "taken": Decimal("0"), "pending": Decimal("0"),
                "carried_forward": Decimal("0"),
            },
        )
        return bal

    @staticmethod
    @transaction.atomic
    def accrue(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int,
        days: Decimal, reason: str = "accrual",
        reference_type: str | None = None, reference_id: uuid.UUID | None = None,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
        )
        # Idempotent ledger append. If a reference is supplied and a row exists,
        # we DO NOT mutate the balance again.
        existing_count = 0
        if reference_type is not None and reference_id is not None:
            from modules.leave.models import LeaveBalanceLedger
            existing_count = LeaveBalanceLedger.objects.filter(
                reference_type=reference_type, reference_id=reference_id, reason=reason,
            ).count()

        LeaveLedgerService.append(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type,
            delta=days, reason=reason,
            reference_type=reference_type, reference_id=reference_id,
            actor_id=actor_id,
        )

        if existing_count == 0:
            bal.accrued = bal.accrued + days
            if reason == "accrual":
                bal.entitled = bal.entitled + days
            bal.save(update_fields=["accrued", "entitled", "updated_at"])

        bal.refresh_from_db()
        return bal

    @staticmethod
    @transaction.atomic
    def hold_pending(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int, days: Decimal,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
        )
        bal.pending = bal.pending + days
        bal.save(update_fields=["pending", "updated_at"])
        return bal

    @staticmethod
    @transaction.atomic
    def release_pending(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int, days: Decimal,
    ) -> LeaveBalance:
        bal = BalanceService.get_or_create(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
        )
        bal.pending = max(Decimal("0"), bal.pending - days)
        bal.save(update_fields=["pending", "updated_at"])
        return bal

    @staticmethod
    @transaction.atomic
    def deduct(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int, days: Decimal,
        reference_type: str, reference_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        """Move days from `pending` to `taken` and append a ledger row."""
        bal = BalanceService.get_or_create(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
        )
        bal.pending = max(Decimal("0"), bal.pending - days)
        bal.taken = bal.taken + days
        bal.save(update_fields=["pending", "taken", "updated_at"])
        LeaveLedgerService.append(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type,
            delta=-days, reason="request_approved",
            reference_type=reference_type, reference_id=reference_id,
            actor_id=actor_id,
        )
        return bal

    @staticmethod
    def grant_replacement(
        *, org_id: uuid.UUID, employee_id: uuid.UUID,
        leave_type: LeaveType, year: int, days: Decimal,
        reference_type: str, reference_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
    ) -> LeaveBalance:
        """Idempotent grant for HolidayWorkConfirmed."""
        return BalanceService.accrue(
            org_id=org_id, employee_id=employee_id, leave_type=leave_type, year=year,
            days=days, reason="holiday_replacement",
            reference_type=reference_type, reference_id=reference_id,
            actor_id=actor_id,
        )
```

- [ ] **Step 5: Run tests, expect green**

```
cd apps/api && uv run pytest modules/leave/tests/test_ledger.py modules/leave/tests/test_balance.py -v 2>&1 | tail -15; cd ../..
```
Expected: 3 ledger + 6 balance = 9 PASS.

- [ ] **Step 6: Commit Task 2**

```
git add apps/api/modules/leave/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): LedgerService (idempotent append) + BalanceService (accrue/hold/deduct/release)"
```

---

## Task 3: PolicyService + seed command + permission codes

**Files:**
- Create: `apps/api/modules/leave/services/policy.py`
- Create: `apps/api/modules/leave/tests/test_policy.py`
- Create: `apps/api/modules/leave/management/commands/seed_leave_types_from_country.py`
- Create: `apps/api/modules/leave/tests/test_seed_command.py`
- Create: `apps/api/modules/identity/fixtures/permissions_m3.yaml`
- Modify: `apps/api/modules/identity/fixtures/default_roles.yaml`

- [ ] **Step 1: Write failing PolicyService tests**

Create `apps/api/modules/leave/tests/test_policy.py`:

```python
"""PolicyService.compute_entitled_days — tenure brackets."""
import datetime
from decimal import Decimal

import pytest

from modules.leave.models import LeavePolicy, LeaveType
from modules.leave.services.policy import PolicyService
from modules.organization.models import Organization


@pytest.fixture
def policy_with_brackets() -> LeavePolicy:
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    return LeavePolicy.all_objects.create(
        org_id=org.id, leave_type=lt,
        days_per_year=Decimal("14"),
        tenure_brackets=[
            {"min_years": 0, "days": 14},
            {"min_years": 2, "days": 18},
            {"min_years": 5, "days": 21},
        ],
        effective_from=datetime.date(2026, 1, 1),
    )


@pytest.mark.django_db
def test_compute_entitled_days_year_zero(policy_with_brackets) -> None:
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2026, 1, 1),
        as_of=datetime.date(2026, 6, 1),
    )
    assert days == Decimal("14")


@pytest.mark.django_db
def test_compute_entitled_days_year_three(policy_with_brackets) -> None:
    """Hired 3 years ago — should hit the 2-year bracket."""
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2023, 6, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("18")


@pytest.mark.django_db
def test_compute_entitled_days_year_seven(policy_with_brackets) -> None:
    days = PolicyService.compute_entitled_days(
        policy=policy_with_brackets,
        hire_date=datetime.date(2019, 6, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("21")


@pytest.mark.django_db
def test_compute_entitled_days_falls_back_to_days_per_year_if_no_brackets() -> None:
    org = Organization.objects.create(
        name="Y", slug="y", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="MEDICAL", name="Medical",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )
    p = LeavePolicy.all_objects.create(
        org_id=org.id, leave_type=lt,
        days_per_year=Decimal("14"),
        tenure_brackets=[],  # empty
        effective_from=datetime.date(2026, 1, 1),
    )
    days = PolicyService.compute_entitled_days(
        policy=p,
        hire_date=datetime.date(2020, 1, 1),
        as_of=datetime.date(2026, 7, 1),
    )
    assert days == Decimal("14")
```

- [ ] **Step 2: Implement `apps/api/modules/leave/services/policy.py`**

```python
"""PolicyService — find applicable policy + compute tenure-bracketed entitlement."""
from __future__ import annotations

import datetime
from decimal import Decimal

from modules.leave.models import LeavePolicy


class PolicyService:
    @staticmethod
    def compute_entitled_days(
        *, policy: LeavePolicy,
        hire_date: datetime.date,
        as_of: datetime.date,
    ) -> Decimal:
        """Compute the entitled days based on tenure brackets.

        Tenure brackets are a list of `{"min_years": N, "days": D}` rows sorted
        ascending by min_years. We pick the highest bracket whose `min_years`
        does not exceed the employee's tenure on `as_of`.
        """
        years_of_service = (as_of - hire_date).days / 365.25

        brackets = policy.tenure_brackets or []
        if not brackets:
            return Decimal(str(policy.days_per_year))

        best = Decimal(str(policy.days_per_year))
        sorted_brackets = sorted(brackets, key=lambda b: b["min_years"])
        for b in sorted_brackets:
            if years_of_service >= b["min_years"]:
                best = Decimal(str(b["days"]))
        return best

    @staticmethod
    def find_applicable_policy(
        *, leave_type: "LeaveType",
        as_of: datetime.date,
        role_id: "uuid.UUID | None" = None,
        department_id: "uuid.UUID | None" = None,
    ) -> LeavePolicy | None:
        """Find the most-specific policy applicable to a (type, role, dept, date)."""
        qs = LeavePolicy.objects.filter(leave_type=leave_type, effective_from__lte=as_of)
        qs = qs.filter(
            (LeavePolicy._meta.get_field("effective_to") and qs.filter(effective_to__isnull=True))
            | qs.filter(effective_to__gte=as_of)
        )
        # Specificity ranking: role-specific > dept-specific > org-wide
        if role_id is not None:
            specific = qs.filter(applies_to_role_id=role_id).first()
            if specific:
                return specific
        if department_id is not None:
            specific = qs.filter(applies_to_department_id=department_id).first()
            if specific:
                return specific
        return qs.filter(applies_to_role_id__isnull=True, applies_to_department_id__isnull=True).first()
```

(Note: the `find_applicable_policy` query above is sketchy — refactor to clean Django Q objects in implementation. The tests don't exercise it in M3b; M3c uses it.)

Cleaner version:

```python
from django.db.models import Q

    @staticmethod
    def find_applicable_policy(
        *, leave_type, as_of, role_id=None, department_id=None,
    ):
        active = LeavePolicy.objects.filter(
            leave_type=leave_type,
            effective_from__lte=as_of,
        ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=as_of))

        if role_id is not None:
            specific = active.filter(applies_to_role_id=role_id).first()
            if specific:
                return specific
        if department_id is not None:
            specific = active.filter(applies_to_department_id=department_id).first()
            if specific:
                return specific
        return active.filter(
            applies_to_role_id__isnull=True,
            applies_to_department_id__isnull=True,
        ).first()
```

- [ ] **Step 3: Run policy tests**

```
cd apps/api && uv run pytest modules/leave/tests/test_policy.py -v 2>&1 | tail -10; cd ../..
```
Expected: 4 PASS.

- [ ] **Step 4: Implement seed command**

Create `apps/api/modules/leave/management/commands/seed_leave_types_from_country.py`:

```python
"""Seed LeaveTypes for an org from country_leave_type_defaults reference data."""
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.leave.models import LeaveType
from modules.organization.models import (
    CountryLeaveTypeDefault,
    Organization,
)


class Command(BaseCommand):
    help = "Seed LeaveTypes for an org from country_leave_type_defaults."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            org = Organization.objects.get(id=uuid.UUID(options["org_id"]))
        except (Organization.DoesNotExist, ValueError) as exc:
            raise CommandError(f"Org not found: {options['org_id']}") from exc

        defaults = CountryLeaveTypeDefault.objects.filter(country_code=org.country_code)
        if not defaults.exists():
            raise CommandError(
                f"No CountryLeaveTypeDefault rows for country={org.country_code}. "
                f"Run `seed_country_reference_data --country {org.country_code}` first."
            )

        n_created = 0
        n_updated = 0
        for d in defaults:
            obj, created = LeaveType.objects.update_or_create(
                org_id=org.id, code=d.code,
                defaults={
                    "name": d.name,
                    "default_days": d.default_days,
                    "accrual_type": d.accrual_type,
                    "is_paid": True,
                    "is_statutory": d.statutory,
                    "gender_restriction": (
                        "female" if d.code == "MATERNITY"
                        else "male" if d.code == "PATERNITY"
                        else "any"
                    ),
                },
            )
            n_created += int(created)
            n_updated += int(not created)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded leave types for org={org.slug}: {n_created} created, {n_updated} updated."
        ))
```

- [ ] **Step 5: Write seed-command tests**

Create `apps/api/modules/leave/tests/test_seed_command.py`:

```python
"""Tests for `seed_leave_types_from_country`."""
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from modules.leave.models import LeaveType
from modules.organization.models import Organization


@pytest.fixture
def org_my() -> Organization:
    return Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.mark.django_db
def test_seed_loads_my_leave_types(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    codes = set(LeaveType.objects.filter(org_id=org_my.id).values_list("code", flat=True))
    # 7 statutory MY types from M1a fixture
    assert codes == {"ANNUAL", "MEDICAL", "MATERNITY", "PATERNITY", "COMPASSIONATE", "UNPAID", "REPLACEMENT"}


@pytest.mark.django_db
def test_seed_idempotent(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    n1 = LeaveType.objects.filter(org_id=org_my.id).count()
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    n2 = LeaveType.objects.filter(org_id=org_my.id).count()
    assert n1 == n2


@pytest.mark.django_db
def test_maternity_is_female_only(org_my: Organization) -> None:
    call_command("seed_country_reference_data", "--country", "MY")
    call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
    mat = LeaveType.objects.get(org_id=org_my.id, code="MATERNITY")
    assert mat.gender_restriction == "female"


@pytest.mark.django_db
def test_seed_errors_when_no_country_data(org_my: Organization) -> None:
    """Skip the country reference seed; should error clearly."""
    with pytest.raises(CommandError):
        call_command("seed_leave_types_from_country", "--org-id", str(org_my.id))
```

- [ ] **Step 6: Run seed tests**

```
cd apps/api && uv run pytest modules/leave/tests/test_seed_command.py -v 2>&1 | tail -10; cd ../..
```
Expected: 4 PASS.

- [ ] **Step 7: Add M3 permission codes**

Create `apps/api/modules/identity/fixtures/permissions_m3.yaml`:

```yaml
# Permission codes added in M3 (leave module).

- { code: leave:request:create:self,    description: Submit a leave request for self }
- { code: leave:request:read:self,      description: Read own leave requests }
- { code: leave:request:read:team,      description: Read direct-reports' leave requests }
- { code: leave:request:read:org,       description: Read all leave requests in the org }
- { code: leave:request:approve:team,   description: Approve/reject leave requests for direct reports }
- { code: leave:request:cancel:self,    description: Cancel own pending request }
- { code: leave:request:cancel:org,     description: Cancel any leave request (HR) }
- { code: leave:balance:read:self,      description: Read own leave balances }
- { code: leave:balance:read:team,      description: Read direct-reports' leave balances }
- { code: leave:balance:read:org,       description: Read all leave balances in the org }
- { code: leave:balance:adjust:org,     description: Manually adjust leave balances (HR) }
- { code: "leave:type:write",            description: Create/edit leave types }
- { code: "leave:policy:write",          description: Create/edit leave policies }
- { code: "leave:delegation:write:self", description: Set/clear own approval delegation }
```

- [ ] **Step 8: Update default_roles.yaml**

Add the M3 codes to relevant roles:

- `org_admin`: all of them.
- `hr_manager`: all of them.
- `manager`, `team_lead`: `leave:request:read:self`, `leave:request:read:team`, `leave:request:approve:team`, `leave:balance:read:self`, `leave:balance:read:team`, `leave:delegation:write:self`.
- `finance`: `leave:request:read:self`, `leave:balance:read:self`, `leave:delegation:write:self`.
- `employee`: `leave:request:create:self`, `leave:request:read:self`, `leave:request:cancel:self`, `leave:balance:read:self`, `leave:delegation:write:self`.
- `auditor`: `leave:request:read:self`, `leave:request:read:team`, `leave:request:read:org`, `leave:balance:read:self`, `leave:balance:read:team`, `leave:balance:read:org`.

Use careful edits to each role's `permissions:` list — don't overwrite existing M1b/M2 codes.

- [ ] **Step 9: Re-run seed permission catalogue**

```
cd apps/api && uv run python manage.py seed_permission_catalogue 2>&1 | tail -3 && uv run pytest modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -10; cd ../..
```
Expected: catalogue grows to ≥ 43 codes (29 M1b+M2 + 14 M3). All identity seed tests still pass; you may need to bump the assertion threshold to `>= 43`.

- [ ] **Step 10: Commit Task 3**

```
git add apps/api/modules/leave/ apps/api/modules/identity/fixtures/ apps/api/modules/identity/tests/test_seed_commands.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): PolicyService + seed-leave-types-from-country + M3 permission codes"
```

---

## M3b Acceptance Criteria

- [ ] `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveBalanceLedger` migrations clean
- [ ] `LeaveLedgerService.append` is idempotent on `(reference_type, reference_id, reason)`
- [ ] `BalanceService.{get_or_create, accrue, hold_pending, release_pending, deduct, grant_replacement}` work
- [ ] `PolicyService.compute_entitled_days` correctly walks tenure brackets
- [ ] `seed_leave_types_from_country --org-id <uuid>` populates 7 MY leave types (Maternity = female-only, Paternity = male-only)
- [ ] Permission catalogue grew to ≥ 43 codes
- [ ] `pytest modules/leave/` is green (~22 tests)
- [ ] `manage.py check` clean
- [ ] No `TODO`/`TBD`/`FIXME`

That is M3b. Next plan: **M3c — Leave requests + approval flow** (uses M3a engine + M3b balance services).
