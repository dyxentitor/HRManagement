# HRMS M2a — Employee Model & Core CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First half of M2. Build the Tier 2 `Employee` model (encrypted bank/IC/tax IDs, MY-specific tax fields, probation/contract tracking, manager_id self-FK), wire RBAC perms, ship the basic viewset (`/api/v1/employees/` CRUD + `/api/v1/employees/me`), and rewire `OrgService` to consult the real Employee model. Specialized endpoints (`reporting-chain`, `direct-reports`, `probation-status`), bank-change MFA, audit integration, and frontend land in M2b.

**Architecture:**
- `Employee` is its own module: `apps/api/modules/employee/`. Owns the model, viewset, services.
- `User` (identity) and `Employee` are separate but linked by `Employee.user_id` (nullable until invited). Splitting them keeps auth concerns out of HR concerns and matches the spec §3.
- `Department.head_employee_id` becomes a real FK in this milestone (M1 left it as a UUIDField). A data migration is included.
- `OrgService` (from M1b-3) gets a default `employee_lookup` that hits `Employee.objects.get`. Existing M1 tests using injected lookups continue to work.

**Tech Stack:** Same as M1. No new deps.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (employees table), §4 (`/employees/*` endpoints), §5 (employee:* permissions).

**Branch:** suggest creating `m2/employees` off master. Do NOT switch back during the plan.

---

## File structure

```
apps/api/
├── modules/employee/                                NEW
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py                                    Employee (Tier 2 fields)
│   ├── repositories.py
│   ├── services.py                                  ← create_employee, get_employee, update_employee
│   ├── serializers.py                               ← EmployeeSerializer, EmployeeMeSerializer (self-edit whitelist)
│   ├── permissions.py                               ← stub (uses HRMSPermission via required_perms)
│   ├── views.py                                     ← EmployeeViewSet, MeView
│   ├── urls.py
│   ├── admin.py
│   ├── migrations/__init__.py
│   ├── migrations/0001_initial.py                   (auto-generated)
│   └── tests/
│       ├── __init__.py
│       ├── test_models.py
│       ├── test_viewset_crud.py
│       └── test_views_me.py
├── modules/identity/
│   ├── fixtures/permissions_m2.yaml                 NEW (employee:* perms)
│   ├── fixtures/default_roles.yaml                  MODIFY (employee:* added to relevant roles)
│   └── services/org.py                              MODIFY (default employee_lookup)
└── modules/organization/
    └── migrations/0003_department_head_employee_fk.py    NEW (data + schema migration)
```

---

## Conventions

- Working dir: `/home/universal/Claude/HR_Management/`
- Branch: `m2/employees` (do `git checkout -b m2/employees` from master at the start of Task 1)
- Per-command commit identity:
  ```
  git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "..."
  ```
- Docker calls: `sg docker -c '...'`.
- TDD discipline: failing test → see fail → minimal code → pass → commit.
- Pre-commit: ruff + biome + detect-secrets active.

---

## Task 1: Create branch + Employee model

**Files:**
- Create: `apps/api/modules/employee/__init__.py`
- Create: `apps/api/modules/employee/apps.py`
- Create: `apps/api/modules/employee/models.py`
- Create: `apps/api/modules/employee/admin.py`
- Create: `apps/api/modules/employee/migrations/__init__.py`
- Create: `apps/api/modules/employee/tests/__init__.py`
- Create: `apps/api/modules/employee/tests/test_models.py`
- Modify: `apps/api/hrms_api/settings/base.py` (register `modules.employee`)

- [ ] **Step 1: Create the feature branch**

```
git checkout master
git checkout -b m2/employees
```

- [ ] **Step 2: Create the package skeleton**

```
mkdir -p apps/api/modules/employee/{tests,migrations}
touch apps/api/modules/employee/__init__.py \
      apps/api/modules/employee/migrations/__init__.py \
      apps/api/modules/employee/tests/__init__.py
```

- [ ] **Step 3: Create `apps.py`**

```python
# apps/api/modules/employee/apps.py
from django.apps import AppConfig


class EmployeeConfig(AppConfig):
    name = "modules.employee"
    label = "employee"
    verbose_name = "Employees"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 4: Write the failing model tests first**

Create `apps/api/modules/employee/tests/test_models.py`:

```python
"""Employee model basics: required fields, uniqueness, encryption, soft-delete."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide a Fernet key for EncryptedCharField."""
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell", slug="provintell",
        country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


@pytest.mark.django_db
def test_employee_minimal_create(org: Organization, dept: Department) -> None:
    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-001",
        first_name="Aminah",
        last_name="binti Ali",
        email="aminah@provintell.local",
        phone="+60123456789",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="1 Jalan Provintell",
        city="Petaling Jaya",
        state="Selangor",
        postcode="46050",
        country_code="MY",
        department=dept,
        role_title="SOC Analyst",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 6, 1),
        bank_name="Maybank",
        emergency_contact_name="Ali bin Ahmad",
        emergency_contact_relationship="father",
        emergency_contact_phone="+60123456788",
    )
    assert isinstance(e.id, uuid.UUID)
    assert e.org_id == org.id
    assert e.status == "active"
    assert e.schedule_type == "fixed"


@pytest.mark.django_db
def test_employee_code_unique_per_org(org: Organization, dept: Department) -> None:
    Employee.all_objects.create(
        org_id=org.id, employee_code="PVT-001",
        first_name="A", last_name="B", email="a@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    with pytest.raises(IntegrityError):
        Employee.all_objects.create(
            org_id=org.id, employee_code="PVT-001",
            first_name="C", last_name="D", email="c@x.com", phone="+2",
            date_of_birth=datetime.date(1991, 1, 1), gender="other", nationality="MY",
            marital_status="single", address_line1="x", city="x", state="x",
            postcode="00000", country_code="MY", department=dept,
            role_title="x", employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1), bank_name="x",
            emergency_contact_name="x", emergency_contact_relationship="x",
            emergency_contact_phone="+2",
        )


@pytest.mark.django_db
def test_employee_ic_encrypted_at_rest(org: Organization, dept: Department) -> None:
    """Setting ic_number stores ciphertext at the DB level; reading roundtrips to plaintext."""
    from django.db import connection

    e = Employee.all_objects.create(
        org_id=org.id, employee_code="PVT-002",
        first_name="A", last_name="B", email="a2@x.com", phone="+1",
        ic_number="900101-14-1234", ic_last4="1234",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    e.refresh_from_db()
    assert e.ic_number == "900101-14-1234"
    assert e.ic_last4 == "1234"

    # Verify ciphertext at the DB level (Postgres + sqlite both expose the bytes column)
    with connection.cursor() as cur:
        cur.execute("SELECT ic_number FROM employee_employee WHERE id = %s", [str(e.id)])
        raw = cur.fetchone()[0]
    if isinstance(raw, memoryview):
        raw = bytes(raw)
    if isinstance(raw, bytes):
        raw = raw.decode("ascii", errors="replace")
    assert raw.startswith("gAAAAA")  # Fernet token prefix


@pytest.mark.django_db
def test_employee_self_manager_protected(org: Organization, dept: Department) -> None:
    """An employee cannot have themselves as manager."""
    e = Employee.all_objects.create(
        org_id=org.id, employee_code="PVT-003",
        first_name="A", last_name="B", email="a3@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    e.manager_id = e.id
    with pytest.raises(Exception):
        e.save()


@pytest.mark.django_db
def test_employee_soft_delete(org: Organization, dept: Department) -> None:
    e = Employee.all_objects.create(
        org_id=org.id, employee_code="PVT-004",
        first_name="A", last_name="B", email="a4@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    e.delete()
    e.refresh_from_db()
    assert e.deleted_at is not None
    # `all_objects` still sees it
    assert Employee.all_objects.filter(pk=e.pk).count() == 1


@pytest.mark.django_db
def test_employee_link_to_user(org: Organization, dept: Department) -> None:
    """Employee can be linked to a User; many employees per org but each Employee has at most one User."""
    user = User.objects.create_user(email="x@example.com", password="x", org_id=org.id)  # pragma: allowlist secret
    e = Employee.all_objects.create(
        org_id=org.id, employee_code="PVT-005",
        user=user,
        first_name="A", last_name="B", email="x@example.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    assert e.user_id == user.id
```

- [ ] **Step 5: Run failing tests, expect ImportError**

```
cd apps/api && uv run pytest modules/employee/tests/test_models.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 6: Implement `apps/api/modules/employee/models.py`**

```python
"""Employee model — Tier 2 fields per spec §3."""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from common.fields import EncryptedCharField
from common.models import TenantBaseModel


GENDER_CHOICES = (
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
    ("undisclosed", "Undisclosed"),
)
MARITAL_CHOICES = (
    ("single", "Single"),
    ("married", "Married"),
    ("divorced", "Divorced"),
    ("widowed", "Widowed"),
)
EMPLOYMENT_TYPE_CHOICES = (
    ("fulltime", "Full-time"),
    ("parttime", "Part-time"),
    ("contract", "Contract"),
    ("intern", "Intern"),
)
SCHEDULE_TYPE_CHOICES = (
    ("fixed", "Fixed"),
    ("shift", "Shift"),
)
STATUS_CHOICES = (
    ("active", "Active"),
    ("probation", "Probation"),
    ("on_leave", "On leave"),
    ("terminated", "Terminated"),
    ("resigned", "Resigned"),
)


class Employee(TenantBaseModel):
    user = models.OneToOneField(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
    )
    employee_code = models.CharField(max_length=32)

    # Core
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    preferred_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=32)
    alt_phone = models.CharField(max_length=32, blank=True)

    # Personal (encrypted IC; last 4 plaintext for display)
    ic_number = EncryptedCharField(max_length=64, null=True, blank=True)
    ic_last4 = models.CharField(max_length=4, blank=True)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=16, choices=GENDER_CHOICES)
    nationality = models.CharField(max_length=2)
    marital_status = models.CharField(max_length=16, choices=MARITAL_CHOICES)
    religion = models.CharField(max_length=32, blank=True)

    # Address
    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postcode = models.CharField(max_length=20)
    country_code = models.CharField(max_length=2)

    # Employment
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.PROTECT,
        related_name="employees",
    )
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports",
    )
    role_title = models.CharField(max_length=100)
    employment_type = models.CharField(max_length=16, choices=EMPLOYMENT_TYPE_CHOICES)
    schedule_type = models.CharField(max_length=8, choices=SCHEDULE_TYPE_CHOICES, default="fixed")
    hire_date = models.DateField()
    probation_end_date = models.DateField(null=True, blank=True)
    contract_end_date = models.DateField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    # Bank (encrypted)
    bank_name = models.CharField(max_length=100)
    bank_account_number = EncryptedCharField(max_length=64, null=True, blank=True)
    bank_account_last4 = models.CharField(max_length=4, blank=True)

    # Tax IDs (MY-specific; encrypted)
    lhdn_tax_no = EncryptedCharField(max_length=64, null=True, blank=True)
    epf_no = EncryptedCharField(max_length=64, null=True, blank=True)
    socso_no = EncryptedCharField(max_length=64, null=True, blank=True)
    eis_no = EncryptedCharField(max_length=64, null=True, blank=True)

    # Emergency contact (single)
    emergency_contact_name = models.CharField(max_length=100)
    emergency_contact_relationship = models.CharField(max_length=50)
    emergency_contact_phone = models.CharField(max_length=32)

    # Ops
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")
    timezone = models.CharField(max_length=64, blank=True)
    locale = models.CharField(max_length=10, blank=True)

    class Meta:
        db_table = "employee_employee"
        constraints = [
            models.UniqueConstraint(
                fields=["org_id", "employee_code"],
                condition=models.Q(deleted_at__isnull=True),
                name="employee_unique_code_per_org",
            ),
        ]
        indexes = [
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["department"]),
            models.Index(fields=["manager"]),
        ]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.employee_code})"

    def clean(self) -> None:
        if self.manager_id == self.id:
            raise ValidationError({"manager": "An employee cannot be their own manager."})

    def save(self, *args, **kwargs):
        # Enforce no-self-management at save time too (clean isn't called by ORM .save())
        if self.manager_id is not None and self.manager_id == self.id:
            raise ValidationError({"manager": "An employee cannot be their own manager."})
        super().save(*args, **kwargs)
```

- [ ] **Step 7: Generate migration**

```
cd apps/api && uv run python manage.py makemigrations employee 2>&1 | tail -5; cd ../..
```
Expected: `0001_initial.py` is created.

- [ ] **Step 8: Register the app**

Edit `apps/api/hrms_api/settings/base.py`. Append `"modules.employee"` to `INSTALLED_APPS` (after `"modules.identity"`):

```python
    "modules.identity",
    "modules.employee",
    "rest_framework_simplejwt.token_blacklist",
```

- [ ] **Step 9: Re-run model tests, expect 6 PASS**

```
cd apps/api && uv run pytest modules/employee/tests/test_models.py -v 2>&1 | tail -15; cd ../..
```

- [ ] **Step 10: Register Employee in admin**

Create `apps/api/modules/employee/admin.py`:

```python
from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_code", "first_name", "last_name", "email",
        "department", "role_title", "status", "hire_date",
    )
    list_filter = ("status", "employment_type", "schedule_type", "department")
    search_fields = ("employee_code", "first_name", "last_name", "email")
    readonly_fields = (
        "id", "ic_last4", "bank_account_last4",
        "created_at", "updated_at", "deleted_at",
    )
    fieldsets = (
        ("Identity", {"fields": ("id", "user", "employee_code", "first_name", "last_name", "preferred_name", "email", "phone", "alt_phone")}),
        ("Personal", {"fields": ("ic_number", "ic_last4", "date_of_birth", "gender", "nationality", "marital_status", "religion")}),
        ("Address", {"fields": ("address_line1", "address_line2", "city", "state", "postcode", "country_code")}),
        ("Employment", {"fields": ("department", "manager", "role_title", "employment_type", "schedule_type", "hire_date", "probation_end_date", "contract_end_date", "confirmed_at", "status")}),
        ("Bank", {"fields": ("bank_name", "bank_account_number", "bank_account_last4")}),
        ("Tax IDs (MY)", {"fields": ("lhdn_tax_no", "epf_no", "socso_no", "eis_no")}),
        ("Emergency Contact", {"fields": ("emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone")}),
        ("Ops", {"fields": ("timezone", "locale", "created_at", "updated_at", "deleted_at")}),
    )
```

- [ ] **Step 11: Run all backend tests + manage.py check**

```
cd apps/api && uv run pytest -q 2>&1 | tail -8 && uv run python manage.py check 2>&1 | tail -3; cd ../..
```
Expected: 127 (M1) + 6 new = 133 passing. Check clean.

- [ ] **Step 12: Commit Task 1**

```
git add apps/api/modules/employee/ apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(employee): Tier 2 Employee model with encrypted IC/bank/tax fields"
```

---

## Task 2: Employee permission codes + role updates

**Files:**
- Create: `apps/api/modules/identity/fixtures/permissions_m2.yaml`
- Modify: `apps/api/modules/identity/fixtures/default_roles.yaml`

- [ ] **Step 1: Create the M2 permission codes fixture**

`apps/api/modules/identity/fixtures/permissions_m2.yaml`:

```yaml
# Permission codes added in M2 (employee module).

- { code: employee:read:self,    description: Read own employee record }
- { code: employee:read:team,    description: Read direct-reports' employee records }
- { code: employee:read:org,     description: Read any employee record in the org }
- { code: employee:write:self,   description: Edit own profile (whitelisted fields) }
- { code: employee:write:org,    description: Edit any employee record (HR) }
- { code: employee:create,       description: Create new employee records }
- { code: employee:archive,      description: Soft-delete (archive) employee records }
- { code: "employee:bank:read",   description: Read employee bank account details }
- { code: "employee:bank:write",  description: Edit employee bank account details (HR) }
- { code: "employee:salary:read", description: Read employee salary fields }
- { code: "employee:salary:write", description: Edit employee salary fields }
```

- [ ] **Step 2: Update default_roles.yaml**

Edit `apps/api/modules/identity/fixtures/default_roles.yaml`. Add the new codes to each role per the spec §5 default mapping:

For `org_admin`:
```yaml
    - employee:read:self
    - employee:read:team
    - employee:read:org
    - employee:write:self
    - employee:write:org
    - employee:create
    - employee:archive
    - employee:bank:read
    - employee:bank:write
    - employee:salary:read
    - employee:salary:write
```

For `hr_manager`: same as `org_admin` minus none (HR sees and edits all).

For `finance`: add `employee:read:self`, `employee:read:team`, `employee:bank:read`, `employee:salary:read`.

For `manager`: add `employee:read:self`, `employee:read:team`.

For `team_lead`: add `employee:read:self`, `employee:read:team`.

For `employee`: add `employee:read:self`, `employee:write:self`.

For `auditor`: add `employee:read:self`, `employee:read:team`, `employee:read:org`, `employee:bank:read`, `employee:salary:read`.

(Don't reproduce the entire file in this step — make a careful Edit of each role's `permissions:` list to include the new codes appropriately.)

- [ ] **Step 3: Verify the seeders pick up the new fixture**

The `seed_permission_catalogue` command (from M1b-1) globs `permissions_*.yaml` so the new fixture will load automatically. The `seed_default_roles` command reads `default_roles.yaml` — its idempotent sync will add/remove permission links to match.

Run manually to verify:

```
cd apps/api && \
  uv run python manage.py seed_permission_catalogue 2>&1 | tail -3 && \
  cd ../..
```
Expected: log shows `Permission catalogue: N entries seen, M created/updated.` with the M1b counts plus 11 new M2 codes.

- [ ] **Step 4: Update existing seed-command tests**

Edit `apps/api/modules/identity/tests/test_seed_commands.py`. The test `test_seed_permission_catalogue_loads_m1b_codes` asserts `len(codes) >= 18`. With the M2 codes added, total is now ≥ 29. Update the assertion threshold OR add a new test specifically for M2 codes.

Add this test after the existing ones:

```python
@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m2_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check M2 codes
    assert "employee:read:org" in codes
    assert "employee:write:self" in codes
    assert "employee:bank:read" in codes
    assert "employee:salary:write" in codes
    assert len(codes) >= 29
```

- [ ] **Step 5: Run the seed tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -15; cd ../..
```
Expected: existing seed tests + new M2 test all green.

- [ ] **Step 6: Commit Task 2**

```
git add apps/api/modules/identity/fixtures/ apps/api/modules/identity/tests/test_seed_commands.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): add employee:* permission codes + extend default roles"
```

---

## Task 3: Employee viewset (CRUD) + `/employees/me`

**Files:**
- Create: `apps/api/modules/employee/repositories.py`
- Create: `apps/api/modules/employee/services.py`
- Create: `apps/api/modules/employee/serializers.py`
- Create: `apps/api/modules/employee/views.py`
- Create: `apps/api/modules/employee/urls.py`
- Modify: `apps/api/hrms_api/urls.py`
- Create: `apps/api/modules/employee/tests/test_viewset_crud.py`
- Create: `apps/api/modules/employee/tests/test_views_me.py`

- [ ] **Step 1: Repositories + services (thin)**

`apps/api/modules/employee/repositories.py`:

```python
"""Repository helpers for Employee."""
from __future__ import annotations

import uuid

from .models import Employee


class EmployeeRepository:
    @staticmethod
    def get(employee_id: uuid.UUID) -> Employee | None:
        return Employee.objects.filter(id=employee_id).first()

    @staticmethod
    def get_by_user_id(user_id: uuid.UUID) -> Employee | None:
        return Employee.objects.filter(user_id=user_id).first()
```

`apps/api/modules/employee/services.py`:

```python
"""Domain services for Employee. Wraps writes for audit + invariants."""
from __future__ import annotations

from typing import Any

from .models import Employee


class EmployeeService:
    @staticmethod
    def create(*, org_id, **fields: Any) -> Employee:
        return Employee.objects.create(org_id=org_id, **fields)

    @staticmethod
    def update(employee: Employee, **fields: Any) -> Employee:
        for k, v in fields.items():
            setattr(employee, k, v)
        # Auto-compute the *_last4 helpers when bank/IC fields change
        if "bank_account_number" in fields and fields["bank_account_number"]:
            employee.bank_account_last4 = fields["bank_account_number"][-4:]
        if "ic_number" in fields and fields["ic_number"]:
            employee.ic_last4 = fields["ic_number"][-4:]
        employee.save()
        return employee
```

- [ ] **Step 2: Serializers**

`apps/api/modules/employee/serializers.py`:

```python
"""Serializers for Employee — full (HR) and self-edit (whitelist)."""
from __future__ import annotations

from rest_framework import serializers

from .models import Employee


# Fields that an employee may edit on their own record. Anything outside this
# list requires `employee:write:org` (HR).
SELF_EDIT_WHITELIST = frozenset({
    "phone", "alt_phone",
    "address_line1", "address_line2", "city", "state", "postcode", "country_code",
    "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone",
    "preferred_name",
    "bank_name", "bank_account_number",  # bank-change still requires re-MFA — enforced in M2b
})


class EmployeeSerializer(serializers.ModelSerializer):
    """Full HR view — all fields readable; encrypted fields write-through."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = (
            "id", "org_id", "user", "employee_code",
            "first_name", "last_name", "preferred_name", "full_name",
            "email", "phone", "alt_phone",
            "ic_number", "ic_last4",
            "date_of_birth", "gender", "nationality", "marital_status", "religion",
            "address_line1", "address_line2", "city", "state", "postcode", "country_code",
            "department", "manager", "role_title", "employment_type", "schedule_type",
            "hire_date", "probation_end_date", "contract_end_date", "confirmed_at",
            "bank_name", "bank_account_number", "bank_account_last4",
            "lhdn_tax_no", "epf_no", "socso_no", "eis_no",
            "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone",
            "status", "timezone", "locale",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "org_id", "ic_last4", "bank_account_last4",
            "created_at", "updated_at",
        )
        extra_kwargs = {
            "ic_number": {"write_only": True},
            "bank_account_number": {"write_only": True},
            "lhdn_tax_no": {"write_only": True},
            "epf_no": {"write_only": True},
            "socso_no": {"write_only": True},
            "eis_no": {"write_only": True},
        }

    def get_full_name(self, obj: Employee) -> str:
        if obj.preferred_name:
            return f"{obj.preferred_name} {obj.last_name}"
        return f"{obj.first_name} {obj.last_name}"


class EmployeeMeSerializer(EmployeeSerializer):
    """Self-edit serializer — limits writable fields to SELF_EDIT_WHITELIST."""

    def get_extra_kwargs(self) -> dict:
        extra = super().get_extra_kwargs()
        for fname in self.Meta.fields:
            if fname in SELF_EDIT_WHITELIST or fname in self.Meta.read_only_fields:
                continue
            extra.setdefault(fname, {}).update({"read_only": True})
        return extra
```

- [ ] **Step 3: Views**

`apps/api/modules/employee/views.py`:

```python
"""Employee CRUD viewset + /employees/me shortcut."""
from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import Employee
from .serializers import EmployeeMeSerializer, EmployeeSerializer
from .services import EmployeeService


class EmployeeViewSet(viewsets.ModelViewSet):
    """HR-facing employee CRUD."""

    serializer_class = EmployeeSerializer
    permission_classes = [HRMSPermission]
    queryset = Employee.objects.all()

    def get_required_perms(self) -> list[str]:
        if self.action in ("list", "retrieve"):
            return ["employee:read:org"]
        if self.action == "create":
            return ["employee:create"]
        if self.action in ("update", "partial_update"):
            return ["employee:write:org"]
        if self.action == "destroy":
            return ["employee:archive"]
        return []

    @property
    def required_perms(self) -> list[str]:
        return self.get_required_perms()

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request, *args, **kwargs):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")

        if request.method == "GET":
            ser = EmployeeMeSerializer(emp, context={"request": request})
            return Response(ser.data)

        # PATCH: self-edit whitelist
        ser = EmployeeMeSerializer(emp, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        # Recompute *_last4 helpers if relevant
        if "bank_account_number" in request.data and request.data["bank_account_number"]:
            emp.bank_account_last4 = request.data["bank_account_number"][-4:]
            emp.save(update_fields=["bank_account_last4", "updated_at"])
        return Response(ser.data, status=status.HTTP_200_OK)

    def get_permissions(self):
        # /employees/me has its own perm check below — accept self-read perm.
        if self.action == "me":
            self.required_perms = ["employee:read:self"] if self.request.method == "GET" else ["employee:write:self"]
        return super().get_permissions()
```

- [ ] **Step 4: URLs**

`apps/api/modules/employee/urls.py`:

```python
from rest_framework.routers import DefaultRouter

from .views import EmployeeViewSet


router = DefaultRouter()
router.register(r"employees", EmployeeViewSet, basename="employee")
urlpatterns = router.urls
```

Modify `apps/api/hrms_api/urls.py`. Add to `api_v1_patterns`:
```python
    path("", include("modules.employee.urls")),
```

- [ ] **Step 5: Write CRUD tests**

Create `apps/api/modules/employee/tests/test_viewset_crud.py`:

```python
"""HR CRUD on /api/v1/employees/."""
import datetime
import os
import uuid

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


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell", slug="provintell",
        country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


def _hr_client(org: Organization) -> tuple[APIClient, User]:
    user = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR Manager", is_system=True)
    for code in ("employee:read:org", "employee:write:org", "employee:create", "employee:archive"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "hr@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return client, user


def _employee_payload(dept: Department) -> dict:
    return {
        "employee_code": "PVT-100",
        "first_name": "Wei", "last_name": "Lin", "email": "wei@example.com",
        "phone": "+60123456789",
        "date_of_birth": "1992-03-15",
        "gender": "female", "nationality": "MY", "marital_status": "single",
        "address_line1": "1 Jalan Provintell", "city": "PJ", "state": "Selangor",
        "postcode": "46050", "country_code": "MY",
        "department": str(dept.id),
        "role_title": "Senior Engineer",
        "employment_type": "fulltime",
        "hire_date": "2024-06-01",
        "bank_name": "Maybank",
        "emergency_contact_name": "Mom", "emergency_contact_relationship": "mother",
        "emergency_contact_phone": "+60123456788",
    }


@pytest.mark.django_db
def test_hr_can_list_employees(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    Employee.all_objects.create(org_id=org.id, **{**_employee_payload(dept), "department": dept})
    resp = client.get("/api/v1/employees/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    assert any(r["employee_code"] == "PVT-100" for r in rows)


@pytest.mark.django_db
def test_hr_can_create_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    resp = client.post("/api/v1/employees/", _employee_payload(dept), format="json")
    assert resp.status_code == 201, resp.content


@pytest.mark.django_db
def test_hr_can_update_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    emp = Employee.all_objects.create(org_id=org.id, **{**_employee_payload(dept), "department": dept})
    resp = client.patch(
        f"/api/v1/employees/{emp.id}/",
        {"role_title": "Lead Engineer"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.role_title == "Lead Engineer"


@pytest.mark.django_db
def test_hr_can_soft_delete_employee(org: Organization, dept: Department) -> None:
    client, _ = _hr_client(org)
    emp = Employee.all_objects.create(org_id=org.id, **{**_employee_payload(dept), "department": dept})
    resp = client.delete(f"/api/v1/employees/{emp.id}/")
    assert resp.status_code in (200, 204)
    emp.refresh_from_db()
    assert emp.deleted_at is not None


@pytest.mark.django_db
def test_employee_without_perm_cannot_list(org: Organization, dept: Department) -> None:
    user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    p, _ = Permission.objects.get_or_create(code="employee:read:self", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post("/api/v1/auth/login", {"email": "emp@x.com", "password": "x"}, format="json").json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    resp = client.get("/api/v1/employees/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_create_returns_401(org: Organization, dept: Department) -> None:
    client = APIClient()
    resp = client.post("/api/v1/employees/", _employee_payload(dept), format="json")
    assert resp.status_code == 401
```

- [ ] **Step 6: Run the CRUD tests**

```
cd apps/api && uv run pytest modules/employee/tests/test_viewset_crud.py -v 2>&1 | tail -10; cd ../..
```
Expected: 6 tests pass.

- [ ] **Step 7: Write `/employees/me` tests**

Create `apps/api/modules/employee/tests/test_views_me.py`:

```python
"""GET/PATCH /api/v1/employees/me — self-service profile."""
import datetime
import os
import uuid

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


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell", slug="provintell",
        country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Engineering")


@pytest.fixture
def employee_with_user(org: Organization, dept: Department) -> tuple[User, Employee, APIClient]:
    user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in ("employee:read:self", "employee:write:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    emp = Employee.all_objects.create(
        org_id=org.id, user=user, employee_code="PVT-200",
        first_name="Aminah", last_name="binti Ali", email="emp@x.com", phone="+60111",
        date_of_birth=datetime.date(1990, 1, 1), gender="female", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="Engineer", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="Maybank",
        emergency_contact_name="Mom", emergency_contact_relationship="mother",
        emergency_contact_phone="+60112",
    )

    client = APIClient()
    login = client.post("/api/v1/auth/login", {"email": "emp@x.com", "password": "x"}, format="json").json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return user, emp, client


@pytest.mark.django_db
def test_get_me_returns_own_profile(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.get("/api/v1/employees/me/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["employee_code"] == emp.employee_code
    assert body["full_name"]


@pytest.mark.django_db
def test_patch_me_can_edit_whitelisted_fields(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"phone": "+60999999", "address_line1": "New Address"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.phone == "+60999999"
    assert emp.address_line1 == "New Address"


@pytest.mark.django_db
def test_patch_me_cannot_edit_role_title(employee_with_user) -> None:
    """role_title is HR-only. Self-edit attempts silently ignored (DRF read_only)."""
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"role_title": "CEO"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.role_title == "Engineer"  # unchanged


@pytest.mark.django_db
def test_patch_me_cannot_edit_employee_code(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"employee_code": "TAMPER-001"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.employee_code == "PVT-200"


@pytest.mark.django_db
def test_get_me_when_no_employee_profile(org: Organization) -> None:
    user = User.objects.create_user(email="solo@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    p, _ = Permission.objects.get_or_create(code="employee:read:self", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post("/api/v1/auth/login", {"email": "solo@x.com", "password": "x"}, format="json").json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    resp = client.get("/api/v1/employees/me/")
    assert resp.status_code == 404
```

- [ ] **Step 8: Run the /me tests**

```
cd apps/api && uv run pytest modules/employee/tests/test_views_me.py -v 2>&1 | tail -10; cd ../..
```
Expected: 5 tests pass. If `test_patch_me_cannot_edit_role_title` fails because the field actually got edited, the EmployeeMeSerializer's `get_extra_kwargs` isn't enforcing read_only — debug the serializer override.

- [ ] **Step 9: Final M2a-T3 sweep + contracts regen**

```
cd apps/api && uv run pytest -q 2>&1 | tail -8 && uv run python manage.py check 2>&1 | tail -3; cd ../..
sg docker -c 'make contracts' 2>&1 | tail -3
```
Expected: 144+ tests pass; check clean; contracts regenerate with `/api/v1/employees/` endpoints.

- [ ] **Step 10: Commit Task 3**

```
git add apps/api/modules/employee/ apps/api/hrms_api/urls.py packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(employee): CRUD viewset + /api/v1/employees/me self-edit endpoint"
```

---

## Task 4: OrgService rewire + Department.head_employee_id FK

**Files:**
- Modify: `apps/api/modules/identity/services/org.py` (default lookup)
- Create: `apps/api/modules/organization/migrations/0003_department_head_employee_fk.py`

- [ ] **Step 1: Update `OrgService` default lookup**

Edit `apps/api/modules/identity/services/org.py`. Replace the `employee_lookup` default with one that hits the Employee model. Existing M1 tests inject their own callable — they still work.

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Optional


def _default_employee_lookup(employee_id: uuid.UUID):
    """Default: look up Employee by primary key. Returns None if not found.

    Imports happen inside the function to avoid a Django app-loading cycle
    (identity is loaded before employee).
    """
    try:
        from modules.employee.models import Employee
        return Employee.objects.filter(id=employee_id).first()
    except Exception:
        return None


@dataclass
class OrgService:
    employee_lookup: Callable[[uuid.UUID], Any] = field(default=_default_employee_lookup)
    max_depth: int = 10

    # ... rest unchanged ...
```

- [ ] **Step 2: Department FK migration**

Create `apps/api/modules/organization/migrations/0003_department_head_employee_fk.py`:

```python
"""Add an FK constraint from departments.head_employee_id to employee_employee.id.

M1 left head_employee_id as a UUIDField. Now that the Employee model exists,
upgrade it to a real ForeignKey. No data migration is needed for fresh DBs;
on databases with stale UUIDs that don't reference real employees, those
values would have to be cleared first — but in M2 we have no rows yet.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0002_department_and_more"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="department",
            name="head_employee_id",
            field=models.UUIDField(null=True, blank=True),  # keep type the same
        ),
        # FK as a separate constraint for explicitness; reverse is to drop FK.
        migrations.RunSQL(
            sql=(
                "ALTER TABLE organization_department "
                "ADD CONSTRAINT fk_department_head_employee "
                "FOREIGN KEY (head_employee_id) "
                "REFERENCES employee_employee (id) "
                "ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;"
            ),
            reverse_sql="ALTER TABLE organization_department DROP CONSTRAINT IF EXISTS fk_department_head_employee;",
        ),
    ]
```

Note: this `RunSQL` is Postgres-specific. For sqlite test DBs, sqlite ignores the `ALTER TABLE ADD CONSTRAINT` syntax differently — it'll error or be a no-op. Wrap in a vendor check using `RunPython` if sqlite tests fail:

```python
from django.db import migrations, models


def add_fk_postgres(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "ALTER TABLE organization_department "
        "ADD CONSTRAINT fk_department_head_employee "
        "FOREIGN KEY (head_employee_id) "
        "REFERENCES employee_employee (id) "
        "ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;"
    )


def drop_fk_postgres(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("ALTER TABLE organization_department DROP CONSTRAINT IF EXISTS fk_department_head_employee;")


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0002_department_and_more"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_fk_postgres, drop_fk_postgres),
    ]
```

Use the `RunPython` form. It'll be a no-op on sqlite test runs (which is fine — sqlite test DB doesn't enforce the FK either way) and adds the real constraint on Postgres.

- [ ] **Step 3: Run all the tests + apply migrations against postgres**

```
cd apps/api && uv run pytest -q 2>&1 | tail -8; cd ../..
sg docker -c 'docker compose -f deploy/docker-compose.yml run --rm api uv run python manage.py migrate' 2>&1 | tail -10
```
Expected: tests still pass (sqlite ignores FK migration); postgres migration applies cleanly.

- [ ] **Step 4: Add OrgService integration test**

Create `apps/api/modules/employee/tests/test_org_service_wired.py`:

```python
"""Integration test: OrgService default lookup hits the real Employee model."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.identity.services.org import OrgService
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _make_employee(org: Organization, dept: Department, code: str, manager: Employee | None = None) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id, employee_code=code,
        first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        manager=manager,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.fixture
def chain():
    org = Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _make_employee(org, dept, "CEO")
    vp = _make_employee(org, dept, "VP", manager=ceo)
    mgr = _make_employee(org, dept, "MGR", manager=vp)
    emp = _make_employee(org, dept, "EMP", manager=mgr)
    return ceo, vp, mgr, emp


@pytest.mark.django_db
def test_default_lookup_resolves_real_employees(chain) -> None:
    """OrgService with no explicit lookup uses Employee.objects.get."""
    ceo, vp, mgr, emp = chain
    svc = OrgService()  # default lookup
    direct = svc.get_direct_manager(emp.id)
    assert direct is not None
    assert direct.id == mgr.id


@pytest.mark.django_db
def test_default_lookup_full_chain(chain) -> None:
    ceo, vp, mgr, emp = chain
    svc = OrgService()
    chain_ids = [e.id for e in svc.get_reporting_chain(emp.id)]
    assert chain_ids == [mgr.id, vp.id, ceo.id]


@pytest.mark.django_db
def test_default_lookup_unknown_id_returns_none() -> None:
    svc = OrgService()
    assert svc.get_direct_manager(uuid.uuid4()) is None
```

- [ ] **Step 5: Run the integration test**

```
cd apps/api && uv run pytest modules/employee/tests/test_org_service_wired.py -v 2>&1 | tail -10; cd ../..
```
Expected: 3 tests pass.

- [ ] **Step 6: Commit Task 4**

```
git add apps/api/modules/identity/services/org.py \
        apps/api/modules/organization/migrations/0003_department_head_employee_fk.py \
        apps/api/modules/employee/tests/test_org_service_wired.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity,organization): wire OrgService to Employee + dept.head_employee FK"
```

---

## M2a Acceptance Criteria

- [ ] `Employee` model migration applies cleanly on a fresh DB
- [ ] All Tier 2 fields present per spec §3 (encrypted IC, bank, LHDN/EPF/SOCSO/EIS)
- [ ] `Employee.manager` is a self-FK; cannot point at self
- [ ] Soft-delete works
- [ ] `seed_permission_catalogue` loads ≥ 29 codes (M1b + M2)
- [ ] Default roles updated with `employee:*` codes
- [ ] `GET/POST/PATCH/DELETE /api/v1/employees/` works for HR-roled users
- [ ] `GET/PATCH /api/v1/employees/me/` works for employee-roled users
- [ ] Self-edit whitelist enforced (employee can't edit role_title, employee_code, etc.)
- [ ] `OrgService()` (no args) resolves manager chains via the Employee model
- [ ] `Department.head_employee_id` is a real FK on Postgres (no-op migration on sqlite)
- [ ] `pytest -q` is fully green (~150 tests cumulative)
- [ ] `manage.py check` clean
- [ ] `make contracts` regenerated with employee endpoints
- [ ] Pre-commit clean
- [ ] No `TODO`/`TBD`/`FIXME` left in committed code

That is M2a. Next plan: **M2b — Specialized endpoints + audit/MFA + frontend**:
- `/employees/{id}/reporting-chain`, `/direct-reports`, `/probation-status`
- Bank-change re-MFA enforcement
- Audit log integration on Employee writes
- Salary fields & `payroll_audit_ledger` writes
- Frontend: employee directory page (admin) + `/me` profile page
- Tag `v0.1.0-m2`
