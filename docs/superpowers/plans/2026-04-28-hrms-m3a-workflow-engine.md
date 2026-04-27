# HRMS M3a — Workflow Engine + Approval Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **shared** approval workflow engine that leave (M3c), claims (M5), KPI cycles (M7), and any future multi-step approval feature will reuse. Plus the `ApprovalDelegation` table that drives "manager-on-leave" routing fallback. No leave-specific code yet.

**Architecture:**
- `common/workflow/` is a self-contained library. It does NOT import from `modules/leave/` or any feature module — those import FROM here.
- The engine is **subject-agnostic**: callers pass a "subject" (e.g., a `LeaveRequest`) and a `WorkflowChain` (named pre-configured), and the engine drives the state machine + emits domain events. Module-specific tables (`leave_approvals`, `claim_approvals`) are written by each module's adapter; the engine doesn't own them.
- `ApprovalDelegation` lives in `common/workflow/` because it's user-level config consumed across modules (delegate "all" / "leave" / "claim" scopes).
- Effective-approver routing (delegation lookup → leave fallback → original) is a pure function on `(candidate_user, on_date)` — easy to test in isolation.

**Tech Stack:** Same as M2. No new deps.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`approval_delegations`), §6 (workflow engine + effective approver routing).

**Branch:** create `m3/workflow` from master at the start of Task 1.

---

## File structure

```
apps/api/common/workflow/                    NEW package
├── __init__.py                               re-exports public surface
├── apps.py
├── models.py                                 ApprovalDelegation
├── chain.py                                  ApprovalStep, WorkflowChain (dataclasses)
├── resolvers.py                              DirectManagerResolver, DepartmentHeadResolver, RoleResolver, FinanceResolver
├── routing.py                                get_effective_approver(...)
├── engine.py                                 WorkflowEngine + WorkflowSubject Protocol + Decision enum
├── service.py                                DelegationService (CRUD-side)
├── exceptions.py                             WorkflowError, InvalidTransition, NoApproverFound
├── migrations/
│   ├── __init__.py
│   └── 0001_initial.py                      (auto-generated)
└── tests/
    ├── __init__.py
    ├── test_chain.py
    ├── test_resolvers.py
    ├── test_routing.py
    ├── test_delegation_service.py
    └── test_engine.py
```

---

## Conventions

- Working dir: `/home/universal/Claude/HR_Management/`
- Branch: `m3/workflow` (do `git checkout -b m3/workflow` from master at Task 1 Step 1)
- Per-command commit identity:
  ```
  git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "..."
  ```
- TDD: failing test → see fail → minimum code → pass → commit
- Pre-commit: ruff + biome + detect-secrets

---

## Task 1: Create branch + ApprovalDelegation model + DelegationService

**Files:**
- Create: `apps/api/common/workflow/__init__.py`
- Create: `apps/api/common/workflow/apps.py`
- Create: `apps/api/common/workflow/models.py`
- Create: `apps/api/common/workflow/exceptions.py`
- Create: `apps/api/common/workflow/service.py`
- Create: `apps/api/common/workflow/migrations/__init__.py`
- Create: `apps/api/common/workflow/tests/__init__.py`
- Create: `apps/api/common/workflow/tests/test_delegation_service.py`
- Modify: `apps/api/hrms_api/settings/base.py` (register `common.workflow`)

- [ ] **Step 1: Create the feature branch + package skeleton**

```
git checkout master
git checkout -b m3/workflow
mkdir -p apps/api/common/workflow/{tests,migrations}
touch apps/api/common/workflow/__init__.py \
      apps/api/common/workflow/migrations/__init__.py \
      apps/api/common/workflow/tests/__init__.py
```

- [ ] **Step 2: Create `apps.py`**

```python
# apps/api/common/workflow/apps.py
from django.apps import AppConfig


class WorkflowConfig(AppConfig):
    name = "common.workflow"
    label = "workflow"
    verbose_name = "Workflow engine"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Create `exceptions.py`**

```python
"""Domain exceptions for the workflow engine."""


class WorkflowError(Exception):
    """Base for all workflow engine errors."""


class InvalidTransition(WorkflowError):
    """Attempted state transition is not allowed for the request's current state."""


class NoApproverFound(WorkflowError):
    """No user could be resolved as the approver for a workflow step."""


class NotAuthorizedToAct(WorkflowError):
    """The acting user is not the resolved approver for this step."""
```

- [ ] **Step 4: Write failing tests for `ApprovalDelegation` model + service**

Create `apps/api/common/workflow/tests/test_delegation_service.py`:

```python
"""ApprovalDelegation model + DelegationService.

Service surface:
    DelegationService.create(delegator, delegate, scope, effective_from, effective_to) -> ApprovalDelegation
    DelegationService.find_active(delegator, scope, on_date) -> ApprovalDelegation | None
    DelegationService.cancel(delegation_id) -> None
    DelegationService.list_for_delegator(delegator) -> list[ApprovalDelegation]
"""
import datetime
import uuid

import pytest

from common.workflow.models import ApprovalDelegation
from common.workflow.service import DelegationService
from modules.identity.models import User


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def delegator(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="d@x.com", password="x", org_id=org_id)  # pragma: allowlist secret


@pytest.fixture
def delegate(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="x@x.com", password="x", org_id=org_id)  # pragma: allowlist secret


@pytest.mark.django_db
def test_create_delegation_basic(delegator: User, delegate: User) -> None:
    d = DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="all",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert d.delegator_id == delegator.id
    assert d.delegate_id == delegate.id
    assert d.scope == "all"
    assert d.cancelled_at is None


@pytest.mark.django_db
def test_create_rejects_self_delegation(delegator: User) -> None:
    with pytest.raises(ValueError):
        DelegationService.create(
            delegator=delegator, delegate=delegator,
            scope="leave",
            effective_from=datetime.date(2026, 5, 1),
            effective_to=datetime.date(2026, 5, 7),
        )


@pytest.mark.django_db
def test_create_rejects_inverted_dates(delegator: User, delegate: User) -> None:
    with pytest.raises(ValueError):
        DelegationService.create(
            delegator=delegator, delegate=delegate,
            scope="leave",
            effective_from=datetime.date(2026, 5, 7),
            effective_to=datetime.date(2026, 5, 1),
        )


@pytest.mark.django_db
def test_find_active_returns_match_within_window_and_scope(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    found = DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 3))
    assert found is not None and found.delegate_id == delegate.id


@pytest.mark.django_db
def test_find_active_all_scope_matches_any_specific_scope(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="all",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 3)) is not None
    assert DelegationService.find_active(delegator, scope="claim", on_date=datetime.date(2026, 5, 3)) is not None


@pytest.mark.django_db
def test_find_active_returns_none_outside_window(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 4, 30)) is None
    assert DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 8)) is None


@pytest.mark.django_db
def test_find_active_skips_cancelled(delegator: User, delegate: User) -> None:
    d = DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    DelegationService.cancel(d.id)
    assert DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 3)) is None


@pytest.mark.django_db
def test_find_active_returns_most_recent_when_overlapping(delegator: User, delegate: User, org_id: uuid.UUID) -> None:
    """If two active delegations overlap, return the most-recently-created."""
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    delegate_b = User.objects.create_user(email="b@x.com", password="x", org_id=org_id)  # pragma: allowlist secret
    DelegationService.create(
        delegator=delegator, delegate=delegate_b,
        scope="leave",
        effective_from=datetime.date(2026, 5, 5),
        effective_to=datetime.date(2026, 5, 15),
    )
    found = DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 7))
    assert found.delegate_id == delegate_b.id  # the more recent one


@pytest.mark.django_db
def test_list_for_delegator_returns_all_owned(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    DelegationService.create(
        delegator=delegator, delegate=delegate,
        scope="claim",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    rows = DelegationService.list_for_delegator(delegator)
    assert len(rows) == 2
```

- [ ] **Step 5: Run failing tests**

```
cd apps/api && uv run pytest common/workflow/tests/test_delegation_service.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 6: Implement `apps/api/common/workflow/models.py`**

```python
"""ApprovalDelegation model — user-level delegation records consumed by the workflow engine."""
from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone


class ApprovalDelegation(models.Model):
    """A delegator hands their approval authority to a delegate for a date window + scope.

    Scopes: 'all' (any approval kind), 'leave', 'claim' (extend as more
    approval-bearing modules ship). The workflow engine's routing function
    consults this table when resolving the effective approver.
    """

    SCOPE_CHOICES: ClassVar[tuple] = (
        ("all", "All"),
        ("leave", "Leave"),
        ("claim", "Claim"),
    )

    id = models.UUIDField(primary_key=True, default=__import__("uuid").uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    delegator = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="approval_delegations_as_delegator",
    )
    delegate = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="approval_delegations_as_delegate",
    )
    scope = models.CharField(max_length=8, choices=SCOPE_CHOICES)
    effective_from = models.DateField()
    effective_to = models.DateField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "workflow_approval_delegation"
        indexes: ClassVar[list] = [
            models.Index(fields=["delegator", "effective_from", "effective_to"]),
            models.Index(fields=["org_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.delegator_id} -> {self.delegate_id} [{self.scope}] {self.effective_from}..{self.effective_to}"
```

- [ ] **Step 7: Implement `apps/api/common/workflow/service.py`**

```python
"""DelegationService — CRUD + active-lookup for ApprovalDelegation."""
from __future__ import annotations

import datetime
import uuid
from typing import Iterable

from django.db.models import Q
from django.utils import timezone

from modules.identity.models import User

from .models import ApprovalDelegation


class DelegationService:
    @staticmethod
    def create(
        *,
        delegator: User,
        delegate: User,
        scope: str,
        effective_from: datetime.date,
        effective_to: datetime.date,
    ) -> ApprovalDelegation:
        if delegator.id == delegate.id:
            raise ValueError("Cannot delegate to self")
        if effective_to < effective_from:
            raise ValueError("effective_to must be on or after effective_from")
        if scope not in {"all", "leave", "claim"}:
            raise ValueError(f"Invalid scope: {scope}")
        return ApprovalDelegation.objects.create(
            org_id=delegator.org_id,
            delegator=delegator,
            delegate=delegate,
            scope=scope,
            effective_from=effective_from,
            effective_to=effective_to,
        )

    @staticmethod
    def cancel(delegation_id: uuid.UUID) -> None:
        ApprovalDelegation.objects.filter(id=delegation_id, cancelled_at__isnull=True).update(
            cancelled_at=timezone.now()
        )

    @staticmethod
    def find_active(
        delegator: User,
        scope: str,
        on_date: datetime.date,
    ) -> ApprovalDelegation | None:
        """Return the most-recently-created active delegation for delegator+scope+date.

        'all' scope matches any specific scope (so a delegator who set scope='all'
        will be found by both scope='leave' and scope='claim' lookups).
        """
        scope_filter = Q(scope=scope) | Q(scope="all")
        return (
            ApprovalDelegation.objects.filter(
                scope_filter,
                delegator=delegator,
                cancelled_at__isnull=True,
                effective_from__lte=on_date,
                effective_to__gte=on_date,
            )
            .order_by("-created_at")
            .first()
        )

    @staticmethod
    def list_for_delegator(delegator: User) -> Iterable[ApprovalDelegation]:
        return list(
            ApprovalDelegation.objects.filter(delegator=delegator).order_by("-created_at")
        )
```

- [ ] **Step 8: Wire `common.workflow` into INSTALLED_APPS**

Edit `apps/api/hrms_api/settings/base.py`. Add `"common.workflow",` to `INSTALLED_APPS`, after `"common.audit",`:

```python
    "common",
    "common.audit",
    "common.workflow",
```

- [ ] **Step 9: Generate migration + run tests**

```
cd apps/api && uv run python manage.py makemigrations workflow 2>&1 | tail -5 && uv run pytest common/workflow/tests/test_delegation_service.py -v 2>&1 | tail -15; cd ../..
```
Expected: `0001_initial.py` created; 9 tests pass.

- [ ] **Step 10: Commit Task 1**

```
git add apps/api/common/workflow/ apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(workflow): ApprovalDelegation model + DelegationService"
```

---

## Task 2: ApprovalStep + WorkflowChain + resolvers

**Files:**
- Create: `apps/api/common/workflow/chain.py`
- Create: `apps/api/common/workflow/resolvers.py`
- Create: `apps/api/common/workflow/tests/test_chain.py`
- Create: `apps/api/common/workflow/tests/test_resolvers.py`

- [ ] **Step 1: Write failing tests for chain + resolvers**

Create `apps/api/common/workflow/tests/test_chain.py`:

```python
"""ApprovalStep + WorkflowChain dataclasses."""
import pytest

from common.workflow.chain import ApprovalStep, WorkflowChain
from common.workflow.resolvers import DirectManagerResolver, FinanceResolver, RoleResolver


def test_approvalstep_required_default_true() -> None:
    step = ApprovalStep(level=1, resolver=DirectManagerResolver())
    assert step.required is True
    assert step.deadline_hours is None


def test_workflowchain_holds_steps_in_level_order() -> None:
    chain = WorkflowChain(
        code="claim_under_500",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
        ],
    )
    assert chain.code == "claim_under_500"
    assert [s.level for s in chain.steps] == [1, 2]


def test_workflowchain_get_step_by_level() -> None:
    chain = WorkflowChain(
        code="x",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
        ],
    )
    assert chain.get_step(1).level == 1
    assert chain.get_step(2).level == 2
    assert chain.get_step(3) is None


def test_workflowchain_total_steps() -> None:
    chain = WorkflowChain(
        code="x",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            ApprovalStep(level=2, resolver=FinanceResolver()),
            ApprovalStep(level=3, resolver=RoleResolver("hr_manager")),
        ],
    )
    assert chain.total_steps == 3
```

Create `apps/api/common/workflow/tests/test_resolvers.py`:

```python
"""Resolvers: turn (subject_employee, request) into the user that should approve."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from common.workflow.resolvers import (
    DepartmentHeadResolver,
    DirectManagerResolver,
    FinanceResolver,
    RoleResolver,
)
from modules.employee.models import Employee
from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _make_user(org, email="u@x.com") -> User:
    return User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret


def _make_employee(org, dept, code: str, manager_emp: Employee | None = None, user: User | None = None) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id, employee_code=code, user=user,
        first_name=code, last_name="x", email=f"{code}@x.com", phone="+1",
        date_of_birth=datetime.date(1990, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept, manager=manager_emp,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X", slug="x", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


@pytest.mark.django_db
def test_direct_manager_resolver_returns_manager_user(org: Organization, dept: Department) -> None:
    manager_user = _make_user(org, email="mgr@x.com")
    manager_emp = _make_employee(org, dept, "MGR", user=manager_user)
    subject_emp = _make_employee(org, dept, "EMP", manager_emp=manager_emp)
    resolver = DirectManagerResolver()
    found = resolver.resolve(subject_emp, request=None)
    assert found is not None and found.id == manager_user.id


@pytest.mark.django_db
def test_direct_manager_resolver_none_when_no_manager(org: Organization, dept: Department) -> None:
    emp = _make_employee(org, dept, "TOP")
    assert DirectManagerResolver().resolve(emp, request=None) is None


@pytest.mark.django_db
def test_direct_manager_resolver_none_when_manager_has_no_user(org: Organization, dept: Department) -> None:
    """If the manager Employee row exists but isn't linked to a User (not invited yet), resolve to None."""
    manager_emp = _make_employee(org, dept, "MGR")  # no user
    subject_emp = _make_employee(org, dept, "EMP", manager_emp=manager_emp)
    assert DirectManagerResolver().resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_department_head_resolver_returns_head_user(org: Organization, dept: Department) -> None:
    head_user = _make_user(org, email="head@x.com")
    head_emp = _make_employee(org, dept, "HEAD", user=head_user)
    dept.head_employee_id = head_emp.id
    dept.save()
    subject_emp = _make_employee(org, dept, "EMP")
    found = DepartmentHeadResolver().resolve(subject_emp, request=None)
    assert found is not None and found.id == head_user.id


@pytest.mark.django_db
def test_department_head_resolver_none_when_no_head(org: Organization, dept: Department) -> None:
    subject_emp = _make_employee(org, dept, "EMP")
    assert DepartmentHeadResolver().resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_role_resolver_returns_first_user_with_role(org: Organization, dept: Department) -> None:
    finance_user = _make_user(org, email="fin@x.com")
    role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=finance_user, role=role, granted_by=None)
    subject_emp = _make_employee(org, dept, "EMP")
    found = RoleResolver("finance").resolve(subject_emp, request=None)
    assert found is not None and found.id == finance_user.id


@pytest.mark.django_db
def test_role_resolver_none_when_no_user_holds_role(org: Organization, dept: Department) -> None:
    subject_emp = _make_employee(org, dept, "EMP")
    assert RoleResolver("nonexistent").resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_finance_resolver_is_role_finance_alias(org: Organization, dept: Department) -> None:
    finance_user = _make_user(org, email="fin@x.com")
    role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=finance_user, role=role, granted_by=None)
    subject_emp = _make_employee(org, dept, "EMP")
    found = FinanceResolver().resolve(subject_emp, request=None)
    assert found is not None and found.id == finance_user.id


@pytest.mark.django_db
def test_role_resolver_scopes_by_org(org: Organization, dept: Department) -> None:
    """A finance user in another org must NOT be returned for this org's subject."""
    other_org = Organization.objects.create(
        name="Y", slug="y", country_code="MY",
        default_currency="MYR", default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    other_finance_user = _make_user(other_org, email="other-fin@x.com")
    other_role = Role.objects.create(org_id=other_org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=other_finance_user, role=other_role, granted_by=None)

    subject_emp = _make_employee(org, dept, "EMP")
    found = FinanceResolver().resolve(subject_emp, request=None)
    assert found is None  # only same-org finance users are eligible
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest common/workflow/tests/test_chain.py common/workflow/tests/test_resolvers.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Implement `apps/api/common/workflow/chain.py`**

```python
"""ApprovalStep + WorkflowChain — declarative shape of an approval workflow."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from modules.identity.models import User


class ApproverResolver(Protocol):
    """Resolves the approver user for a given subject employee + request."""

    def resolve(self, subject_employee: Any, request: Any) -> Optional[User]: ...


@dataclass(frozen=True)
class ApprovalStep:
    level: int
    resolver: ApproverResolver
    required: bool = True
    deadline_hours: Optional[int] = None  # Phase 2: SLA / escalation


@dataclass(frozen=True)
class WorkflowChain:
    """Named sequence of approval steps. Reusable across feature modules."""

    code: str
    steps: list[ApprovalStep] = field(default_factory=list)

    def get_step(self, level: int) -> Optional[ApprovalStep]:
        for s in self.steps:
            if s.level == level:
                return s
        return None

    @property
    def total_steps(self) -> int:
        return len(self.steps)
```

- [ ] **Step 4: Implement `apps/api/common/workflow/resolvers.py`**

```python
"""Built-in resolvers — direct manager, department head, role-based, finance."""
from __future__ import annotations

from typing import Any, Optional

from modules.identity.models import Role, User, UserRole
from modules.identity.services.org import OrgService


class DirectManagerResolver:
    """Resolves to the user linked to the subject employee's manager."""

    def resolve(self, subject_employee: Any, request: Any) -> Optional[User]:
        org = OrgService()
        mgr_emp = org.get_direct_manager(subject_employee.id)
        if mgr_emp is None:
            return None
        return getattr(mgr_emp, "user", None)


class DepartmentHeadResolver:
    """Resolves to the user linked to the subject employee's department head."""

    def resolve(self, subject_employee: Any, request: Any) -> Optional[User]:
        head_id = getattr(subject_employee.department, "head_employee_id", None)
        if head_id is None:
            return None
        from modules.employee.models import Employee
        head = Employee.all_objects.filter(id=head_id).first()
        if head is None:
            return None
        return getattr(head, "user", None)


class RoleResolver:
    """Resolves to any user holding the named role within the subject's org.

    Returns the first match (deterministic by user.created_at). If multiple
    candidates exist, all of them get notified by the workflow engine; only
    one needs to act. (Phase 1 simplification — Phase 2 may add round-robin.)
    """

    def __init__(self, role_code: str) -> None:
        self.role_code = role_code

    def resolve(self, subject_employee: Any, request: Any) -> Optional[User]:
        try:
            role = Role.objects.get(org_id=subject_employee.org_id, code=self.role_code)
        except Role.DoesNotExist:
            return None
        ur = (
            UserRole.objects.filter(role=role)
            .select_related("user")
            .order_by("user__created_at")
            .first()
        )
        return ur.user if ur is not None else None


class FinanceResolver(RoleResolver):
    """Convenience: RoleResolver('finance')."""

    def __init__(self) -> None:
        super().__init__(role_code="finance")
```

- [ ] **Step 5: Run tests, expect green**

```
cd apps/api && uv run pytest common/workflow/tests/test_chain.py common/workflow/tests/test_resolvers.py -v 2>&1 | tail -15; cd ../..
```
Expected: 4 chain tests + 9 resolver tests = 13 PASS.

- [ ] **Step 6: Commit Task 2**

```
git add apps/api/common/workflow/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(workflow): ApprovalStep, WorkflowChain, resolvers (manager, dept head, role, finance)"
```

---

## Task 3: Effective approver routing

**Files:**
- Create: `apps/api/common/workflow/routing.py`
- Create: `apps/api/common/workflow/tests/test_routing.py`

- [ ] **Step 1: Write failing tests**

Create `apps/api/common/workflow/tests/test_routing.py`:

```python
"""Effective approver routing: delegation lookup → leave-fallback → original."""
import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from common.workflow.routing import get_effective_approver
from common.workflow.service import DelegationService
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


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
def chain_users(org: Organization, dept: Department):
    """Build a chain of three users + linked employees: emp -> mgr -> grandmgr."""
    grandmgr_user = User.objects.create_user(email="gm@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    mgr_user = User.objects.create_user(email="mgr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp_user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    grandmgr = Employee.all_objects.create(
        org_id=org.id, user=grandmgr_user, employee_code="GM",
        first_name="GM", last_name="x", email="gm@x.com", phone="+1",
        date_of_birth=datetime.date(1980, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )
    mgr = Employee.all_objects.create(
        org_id=org.id, user=mgr_user, employee_code="MGR",
        first_name="MGR", last_name="x", email="mgr@x.com", phone="+1",
        date_of_birth=datetime.date(1985, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        manager=grandmgr,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )
    return grandmgr_user, mgr_user, emp_user, mgr


@pytest.mark.django_db
def test_no_delegation_no_leave_returns_original(chain_users) -> None:
    _, mgr_user, _, _ = chain_users
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 7),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found.id == mgr_user.id


@pytest.mark.django_db
def test_active_delegation_overrides_original(chain_users) -> None:
    _, mgr_user, emp_user, _ = chain_users
    DelegationService.create(
        delegator=mgr_user, delegate=emp_user,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found.id == emp_user.id


@pytest.mark.django_db
def test_leave_fallback_uses_grandmgr_when_no_delegation(chain_users) -> None:
    grandmgr_user, mgr_user, _, mgr_emp = chain_users
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda u, _d: u.id == mgr_user.id,
    )
    assert found.id == grandmgr_user.id


@pytest.mark.django_db
def test_delegation_takes_priority_over_leave_fallback(chain_users) -> None:
    """Even if mgr is on leave, an explicit delegation wins."""
    grandmgr_user, mgr_user, emp_user, _ = chain_users
    DelegationService.create(
        delegator=mgr_user, delegate=emp_user,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda u, _d: u.id == mgr_user.id,
    )
    assert found.id == emp_user.id


@pytest.mark.django_db
def test_leave_fallback_returns_candidate_when_no_grandmgr(org: Organization, dept: Department) -> None:
    """If the candidate is on leave but has no manager-of-manager, return the candidate.

    HR can manually intervene; the engine doesn't refuse routing.
    """
    user = User.objects.create_user(email="lone@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    Employee.all_objects.create(
        org_id=org.id, user=user, employee_code="LONE",
        first_name="x", last_name="x", email="lone@x.com", phone="+1",
        date_of_birth=datetime.date(1985, 1, 1), gender="other", nationality="MY",
        marital_status="single", address_line1="x", city="x", state="x",
        postcode="00000", country_code="MY", department=dept,
        role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), bank_name="x",
        emergency_contact_name="x", emergency_contact_relationship="x", emergency_contact_phone="+1",
    )
    found = get_effective_approver(
        candidate=user, scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: True,
    )
    assert found.id == user.id


@pytest.mark.django_db
def test_returns_none_when_candidate_is_none(chain_users) -> None:
    found = get_effective_approver(
        candidate=None, scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found is None
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest common/workflow/tests/test_routing.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Implement `apps/api/common/workflow/routing.py`**

```python
"""Effective approver routing: who really should approve, given delegations and leave fallbacks?

Priority order:
  1. Active manual delegation (delegator → delegate, scope-matched, date-matched) → delegate
  2. If candidate is on approved leave today → walk up to candidate's direct manager
  3. Otherwise → original candidate
"""
from __future__ import annotations

import datetime
from typing import Callable, Optional

from modules.identity.models import User
from modules.identity.services.org import OrgService

from .service import DelegationService


def get_effective_approver(
    *,
    candidate: Optional[User],
    scope: str,
    on_date: datetime.date,
    is_on_leave_lookup: Callable[[User, datetime.date], bool],
) -> Optional[User]:
    """Return the user that should actually act on this approval step today.

    Args:
        candidate: the resolver-suggested approver (e.g., direct manager).
        scope: 'all' | 'leave' | 'claim'.
        on_date: the date for which routing is being decided (today, usually).
        is_on_leave_lookup: callable that the leave module injects;
            returns True if the given user is on approved leave on the date.
            Injected so this function stays decoupled from the leave module.
    """
    if candidate is None:
        return None

    # 1. Manual delegation
    delegation = DelegationService.find_active(candidate, scope=scope, on_date=on_date)
    if delegation is not None:
        return delegation.delegate

    # 2. Leave fallback
    if is_on_leave_lookup(candidate, on_date):
        # Walk up via OrgService (employee chain). Need to find candidate's
        # employee record first.
        from modules.employee.models import Employee
        employee = Employee.all_objects.filter(user_id=candidate.id).first()
        if employee is None:
            return candidate
        upstream_emp = OrgService().get_direct_manager(employee.id)
        if upstream_emp is None:
            return candidate
        upstream_user = getattr(upstream_emp, "user", None)
        return upstream_user if upstream_user is not None else candidate

    # 3. Original
    return candidate
```

- [ ] **Step 4: Run tests, expect 6 PASS**

```
cd apps/api && uv run pytest common/workflow/tests/test_routing.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 5: Commit Task 3**

```
git add apps/api/common/workflow/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(workflow): get_effective_approver routes via delegation + leave fallback"
```

---

## Task 4: WorkflowEngine state machine

**Files:**
- Create: `apps/api/common/workflow/engine.py`
- Create: `apps/api/common/workflow/tests/test_engine.py`
- Modify: `apps/api/common/workflow/__init__.py` (re-exports)

- [ ] **Step 1: Write failing engine tests**

Create `apps/api/common/workflow/tests/test_engine.py`:

```python
"""WorkflowEngine state machine — tested against an in-memory fake subject.

The engine is subject-agnostic. Real callers (leave, claims) wrap their
own Request models with the WorkflowSubject Protocol. These tests use a
simple dataclass to verify the transitions.
"""
import datetime
import os
import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest
from cryptography.fernet import Fernet

from common.workflow.chain import ApprovalStep, WorkflowChain
from common.workflow.engine import (
    Decision,
    InvalidTransition,
    NoApproverFound,
    NotAuthorizedToAct,
    WorkflowEngine,
)
from common.workflow.resolvers import DirectManagerResolver
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


@dataclass
class FakeSubject:
    """Simulates a leave/claim request. The engine calls these methods."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    org_id: uuid.UUID = field(default_factory=uuid.uuid4)
    employee_id: uuid.UUID = field(default_factory=uuid.uuid4)
    employee: Any = None  # set by tests to the actual Employee
    status: str = "draft"
    current_level: int = 0
    decisions: list = field(default_factory=list)


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
def employees(org: Organization, dept: Department):
    """grandmgr_user, mgr_user, emp_user, emp_employee, mgr_employee."""
    grandmgr_user = User.objects.create_user(email="gm@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    mgr_user = User.objects.create_user(email="mgr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp_user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    def _e(code, user, manager=None):
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

    gm = _e("GM", grandmgr_user)
    mgr = _e("MGR", mgr_user, manager=gm)
    emp = _e("EMP", emp_user, manager=mgr)
    return grandmgr_user, mgr_user, emp_user, emp, mgr


@pytest.fixture
def single_step_chain() -> WorkflowChain:
    return WorkflowChain(
        code="leave_default",
        steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())],
    )


@pytest.mark.django_db
def test_submit_moves_draft_to_submitted(employees, single_step_chain) -> None:
    _, _, emp_user, emp_employee, _ = employees
    subj = FakeSubject(org_id=emp_employee.org_id, employee_id=emp_employee.id, employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    assert subj.status == "submitted"
    assert subj.current_level == 1


@pytest.mark.django_db
def test_submit_from_non_draft_raises_invalidtransition(employees, single_step_chain) -> None:
    _, _, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="approved")
    with pytest.raises(InvalidTransition):
        WorkflowEngine().submit(subj, chain=single_step_chain)


@pytest.mark.django_db
def test_submit_raises_when_no_approver_found(employees) -> None:
    _, _, _, emp_employee, _ = employees
    # Subject employee has no manager; default chain still uses DirectManagerResolver
    emp_employee.manager = None
    emp_employee.save()
    chain = WorkflowChain(code="x", steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())])
    subj = FakeSubject(employee=emp_employee, status="draft")
    with pytest.raises(NoApproverFound):
        WorkflowEngine().submit(subj, chain=chain)


@pytest.mark.django_db
def test_act_approve_single_step_terminates_at_approved(employees, single_step_chain) -> None:
    _, mgr_user, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    engine.act(subj, chain=single_step_chain, actor=mgr_user, decision=Decision.APPROVE, comment="lgtm")
    assert subj.status == "approved"


@pytest.mark.django_db
def test_act_reject_terminates_at_rejected(employees, single_step_chain) -> None:
    _, mgr_user, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    engine.act(subj, chain=single_step_chain, actor=mgr_user, decision=Decision.REJECT, comment="no")
    assert subj.status == "rejected"


@pytest.mark.django_db
def test_act_by_unauthorized_user_raises(employees, single_step_chain) -> None:
    _, _, emp_user, emp_employee, _ = employees  # emp_user is the subject, NOT the approver
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    with pytest.raises(NotAuthorizedToAct):
        engine.act(subj, chain=single_step_chain, actor=emp_user, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_act_two_step_chain_advances_then_approves(employees) -> None:
    grandmgr_user, mgr_user, _, emp_employee, _ = employees
    chain = WorkflowChain(
        code="two_step",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            # Step 2 is an artificial "grandmgr resolver" — use a custom resolver that returns grandmgr
            ApprovalStep(level=2, resolver=_GrandManagerResolver()),
        ],
    )
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=chain)
    # Level 1: mgr approves
    engine.act(subj, chain=chain, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    assert subj.status == "submitted"
    assert subj.current_level == 2
    # Level 2: grandmgr approves
    engine.act(subj, chain=chain, actor=grandmgr_user, decision=Decision.APPROVE, comment="ok")
    assert subj.status == "approved"


@pytest.mark.django_db
def test_cancel_moves_to_cancelled_state(employees, single_step_chain) -> None:
    _, _, emp_user, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="submitted", current_level=1)
    WorkflowEngine().cancel(subj, actor=emp_user)
    assert subj.status == "cancelled"


class _GrandManagerResolver:
    """Test helper: walks up two levels."""

    def resolve(self, subject_employee, request):
        from modules.identity.services.org import OrgService
        mgr = OrgService().get_direct_manager(subject_employee.id)
        if mgr is None:
            return None
        gm = OrgService().get_direct_manager(mgr.id)
        if gm is None:
            return None
        return getattr(gm, "user", None)
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest common/workflow/tests/test_engine.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Implement `apps/api/common/workflow/engine.py`**

```python
"""WorkflowEngine — subject-agnostic state machine for multi-step approvals.

Subjects (LeaveRequest, ClaimRequest, etc.) implement the WorkflowSubject
Protocol — the engine reads/writes `status` + `current_level` on them.
Domain events (Submitted/Approved/Rejected/etc.) are emitted as Django
signals so feature modules can react.
"""
from __future__ import annotations

import datetime
import enum
from typing import Any, Optional, Protocol

from django.dispatch import Signal

from modules.identity.models import User

from .chain import WorkflowChain
from .exceptions import (
    InvalidTransition,
    NoApproverFound,
    NotAuthorizedToAct,
)
from .routing import get_effective_approver


# --- Signals ---
workflow_submitted = Signal()       # subject, chain
workflow_step_approved = Signal()   # subject, chain, level, actor, comment
workflow_step_rejected = Signal()   # subject, chain, level, actor, comment
workflow_approved = Signal()        # subject, chain
workflow_rejected = Signal()        # subject, chain, actor, comment
workflow_cancelled = Signal()       # subject, actor
workflow_withdrawn = Signal()       # subject, actor


class Decision(enum.Enum):
    APPROVE = "approve"
    REJECT = "reject"


class WorkflowSubject(Protocol):
    """Duck-typed subject. Engine reads/writes `status` and `current_level` on it.

    Required attributes:
      - status: str (one of {'draft', 'submitted', 'approved', 'rejected', 'cancelled', 'withdrawn'})
      - current_level: int (0 when draft; 1+ once submitted)
      - employee: Employee-like object with .id
    """

    status: str
    current_level: int
    employee: Any


def _is_on_leave_default(user: User, on_date: datetime.date) -> bool:
    """Default leave-fallback lookup: not on leave.

    The leave module overrides this by passing its own callable when constructing
    the engine, e.g.:

        engine = WorkflowEngine(is_on_leave_lookup=leave_service.is_on_approved_leave)
    """
    return False


class WorkflowEngine:
    """Drives a subject through its approval chain.

    The engine does NOT persist anything itself — it mutates the subject in
    place and emits signals. Callers are responsible for saving and for
    inserting per-module approval rows (leave_approvals, claim_approvals).
    """

    def __init__(self, is_on_leave_lookup=None) -> None:
        self.is_on_leave_lookup = is_on_leave_lookup or _is_on_leave_default

    # --- transitions ---

    def submit(self, subject: WorkflowSubject, chain: WorkflowChain) -> None:
        if subject.status != "draft":
            raise InvalidTransition(f"Cannot submit from status='{subject.status}'")

        first_step = chain.get_step(1)
        if first_step is None:
            raise InvalidTransition(f"Chain '{chain.code}' has no level 1 step")

        approver = self._resolve_step(subject, chain, level=1)
        if approver is None:
            raise NoApproverFound(f"No approver found for chain={chain.code} level=1")

        subject.status = "submitted"
        subject.current_level = 1
        workflow_submitted.send(sender=self.__class__, subject=subject, chain=chain)

    def act(
        self,
        subject: WorkflowSubject,
        chain: WorkflowChain,
        actor: User,
        decision: Decision,
        comment: str = "",
    ) -> None:
        if subject.status != "submitted":
            raise InvalidTransition(f"Cannot act on status='{subject.status}'")

        expected_approver = self._resolve_step(subject, chain, level=subject.current_level)
        if expected_approver is None:
            raise NoApproverFound(f"No approver found for chain={chain.code} level={subject.current_level}")
        if expected_approver.id != actor.id:
            raise NotAuthorizedToAct(
                f"User {actor.id} is not the resolved approver ({expected_approver.id}) "
                f"for chain={chain.code} level={subject.current_level}"
            )

        if decision == Decision.REJECT:
            subject.status = "rejected"
            workflow_step_rejected.send(
                sender=self.__class__,
                subject=subject, chain=chain, level=subject.current_level,
                actor=actor, comment=comment,
            )
            workflow_rejected.send(sender=self.__class__, subject=subject, chain=chain, actor=actor, comment=comment)
            return

        # APPROVE — advance or terminate
        workflow_step_approved.send(
            sender=self.__class__,
            subject=subject, chain=chain, level=subject.current_level,
            actor=actor, comment=comment,
        )
        next_level = subject.current_level + 1
        if next_level > chain.total_steps:
            subject.status = "approved"
            workflow_approved.send(sender=self.__class__, subject=subject, chain=chain)
            return

        subject.current_level = next_level

    def cancel(self, subject: WorkflowSubject, actor: User) -> None:
        if subject.status not in {"draft", "submitted"}:
            raise InvalidTransition(f"Cannot cancel from status='{subject.status}'")
        subject.status = "cancelled"
        workflow_cancelled.send(sender=self.__class__, subject=subject, actor=actor)

    def withdraw(self, subject: WorkflowSubject, actor: User) -> None:
        """Withdraw is the requester's pre-approval cancel. State-wise same as cancel
        but emits a different signal so notifications can differ.
        """
        if subject.status != "submitted":
            raise InvalidTransition(f"Cannot withdraw from status='{subject.status}'")
        subject.status = "withdrawn"
        workflow_withdrawn.send(sender=self.__class__, subject=subject, actor=actor)

    # --- helpers ---

    def _resolve_step(
        self,
        subject: WorkflowSubject,
        chain: WorkflowChain,
        level: int,
    ) -> Optional[User]:
        step = chain.get_step(level)
        if step is None:
            return None
        candidate = step.resolver.resolve(subject.employee, request=subject)
        return get_effective_approver(
            candidate=candidate,
            scope=self._scope_for_chain(chain),
            on_date=datetime.date.today(),
            is_on_leave_lookup=self.is_on_leave_lookup,
        )

    @staticmethod
    def _scope_for_chain(chain: WorkflowChain) -> str:
        # Chain codes prefixed with 'leave_' are leave-scope; 'claim_' are claim-scope.
        if chain.code.startswith("leave"):
            return "leave"
        if chain.code.startswith("claim"):
            return "claim"
        return "all"
```

- [ ] **Step 4: Update `apps/api/common/workflow/__init__.py` with re-exports**

```python
"""Public surface for the workflow engine."""
from .chain import ApprovalStep, ApproverResolver, WorkflowChain
from .engine import (
    Decision,
    WorkflowEngine,
    WorkflowSubject,
    workflow_approved,
    workflow_cancelled,
    workflow_rejected,
    workflow_step_approved,
    workflow_step_rejected,
    workflow_submitted,
    workflow_withdrawn,
)
from .exceptions import (
    InvalidTransition,
    NoApproverFound,
    NotAuthorizedToAct,
    WorkflowError,
)
from .resolvers import (
    DepartmentHeadResolver,
    DirectManagerResolver,
    FinanceResolver,
    RoleResolver,
)
from .routing import get_effective_approver
from .service import DelegationService

__all__ = [
    "ApprovalStep", "ApproverResolver", "WorkflowChain",
    "Decision", "WorkflowEngine", "WorkflowSubject",
    "workflow_approved", "workflow_cancelled", "workflow_rejected",
    "workflow_step_approved", "workflow_step_rejected",
    "workflow_submitted", "workflow_withdrawn",
    "InvalidTransition", "NoApproverFound", "NotAuthorizedToAct", "WorkflowError",
    "DepartmentHeadResolver", "DirectManagerResolver", "FinanceResolver", "RoleResolver",
    "get_effective_approver",
    "DelegationService",
]
```

- [ ] **Step 5: Run engine tests, expect 8 PASS**

```
cd apps/api && uv run pytest common/workflow/tests/test_engine.py -v 2>&1 | tail -15; cd ../..
```

- [ ] **Step 6: Final M3a sweep**

```
cd apps/api && uv run pytest common/workflow/ -v 2>&1 | tail -10 && uv run python manage.py check 2>&1 | tail -3; cd ../..
```
Expected: ~36 workflow tests pass (9 delegation + 4 chain + 9 resolvers + 6 routing + 8 engine).

- [ ] **Step 7: Commit Task 4**

```
git add apps/api/common/workflow/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(workflow): WorkflowEngine state machine + signals + public re-exports"
```

---

## M3a Acceptance Criteria

- [ ] `from common.workflow import WorkflowEngine, WorkflowChain, ApprovalStep, DirectManagerResolver, FinanceResolver, RoleResolver, DepartmentHeadResolver, DelegationService, Decision, get_effective_approver` all resolve
- [ ] `ApprovalDelegation` table created via migration
- [ ] `DelegationService.{create, cancel, find_active, list_for_delegator}` work and are tested
- [ ] All 4 resolvers (manager / dept head / role / finance) tested against real Employees + Users
- [ ] `get_effective_approver` correctly handles delegation > leave fallback > original priority
- [ ] `WorkflowEngine.submit` raises on non-draft + when no approver resolved
- [ ] `WorkflowEngine.act` raises `NotAuthorizedToAct` if actor isn't the resolved approver, advances multi-step, terminates correctly on approve/reject
- [ ] `WorkflowEngine.cancel` and `withdraw` raise on illegal states; emit distinct signals
- [ ] `pytest common/workflow/` is fully green (~36 tests)
- [ ] `manage.py check` clean
- [ ] No `TODO`/`TBD`/`FIXME`

That is M3a. Next plan: **M3b — Leave types, policies, balances, ledger** (uses M3a's engine but doesn't yet wire it).
