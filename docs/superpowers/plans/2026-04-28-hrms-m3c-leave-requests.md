# HRMS M3c — Leave Requests + Approval Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire user-facing leave functionality. `LeaveRequest` + `LeaveApproval` models, a leave-specific approval chain that uses M3a's `WorkflowEngine`, and the API endpoints (`POST /leave/requests`, `/submit`, `/approve`, `/reject`, `/cancel`, `/withdraw`, `GET /leave/balances/{me|employee_id}`, `GET /leave/requests`). After this, an employee can apply for leave, a manager can approve, and the balance updates.

**Architecture:**
- `LeaveRequest` is a `WorkflowSubject` — has `status` (`draft|submitted|approved|rejected|cancelled|withdrawn`) and `current_level`. The engine drives the state machine.
- `LeaveApproval` is a per-step audit trail row. Inserted by a signal handler listening to M3a's `workflow_step_approved`/`workflow_step_rejected` signals.
- `LeaveWorkflowService` is the leave module's adapter — wraps `WorkflowEngine` with leave-specific logic (balance hold on submit, balance deduct on final approve, balance release on cancel/reject, `is_on_approved_leave` lookup for routing).
- The leave chain is currently 1-step (`LEAVE_DEFAULT`: DirectManager) per spec §6. HR can manually create longer chains via DB if needed; that's not in scope.

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`leave_requests`, `leave_approvals`), §4 (endpoints), §6 (workflow integration).

**Branch:** `m3/workflow` (current).

---

## File structure (NEW & MODIFIED)

```
apps/api/modules/leave/
├── models.py                                  + LeaveRequest, LeaveApproval
├── services/
│   ├── leave_request.py                       NEW — LeaveRequestService
│   └── workflow_adapter.py                    NEW — LeaveWorkflowService (wraps M3a engine)
├── chains.py                                  NEW — LEAVE_DEFAULT chain registry
├── signals.py                                 NEW — handle workflow signals
├── apps.py                                    MODIFY — call signals.ready()
├── serializers.py                             NEW
├── views.py                                   NEW
├── urls.py                                    NEW
├── migrations/0002_*.py                       (auto-generated)
└── tests/
    ├── test_leave_request_service.py
    ├── test_endpoints.py
    └── test_workflow_integration.py
```

Modify `apps/api/hrms_api/urls.py` to mount `modules.leave.urls`.

---

## Task 1: LeaveRequest + LeaveApproval models

**Files:**
- Modify: `apps/api/modules/leave/models.py` (append LeaveRequest + LeaveApproval)
- Modify tests: include in existing `tests/test_models.py` or create separate file

- [ ] **Step 1: Write failing tests**

Append to or create `apps/api/modules/leave/tests/test_request_models.py`:

```python
"""LeaveRequest + LeaveApproval models."""
import datetime
import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveApproval, LeaveRequest, LeaveType
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
    return org, lt


@pytest.mark.django_db
def test_leave_request_create_draft(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=uuid.uuid4(), leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False,
        reason="Family trip",
    )
    assert r.status == "draft"
    assert r.current_level == 0


@pytest.mark.django_db
def test_leave_request_half_day(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=uuid.uuid4(), leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 1),
        total_days=Decimal("0.5"), is_half_day=True, half_day_period="am",
        reason="Doctor",
    )
    assert r.is_half_day is True
    assert r.half_day_period == "am"


@pytest.mark.django_db
def test_leave_approval_link(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=uuid.uuid4(), leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="x",
    )
    approver_id = uuid.uuid4()
    approval = LeaveApproval.objects.create(
        leave_request=r, level=1, approver_id=approver_id, status="pending",
    )
    assert approval.status == "pending"
    assert r.approvals.count() == 1
```

- [ ] **Step 2: Append to `apps/api/modules/leave/models.py`**

```python
class LeaveRequest(TenantBaseModel):
    REQUEST_STATUSES: ClassVar[tuple] = (
        ("draft", "Draft"),
        ("submitted", "Submitted"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
        ("withdrawn", "Withdrawn"),
    )
    HALF_DAY_PERIOD_CHOICES: ClassVar[tuple] = (
        ("am", "AM"),
        ("pm", "PM"),
    )

    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="requests")
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.DecimalField(max_digits=5, decimal_places=2)
    is_half_day = models.BooleanField(default=False)
    half_day_period = models.CharField(max_length=2, choices=HALF_DAY_PERIOD_CHOICES, blank=True)
    reason = models.TextField(blank=True)
    attachment_url = models.URLField(blank=True)
    status = models.CharField(max_length=16, choices=REQUEST_STATUSES, default="draft")
    current_level = models.IntegerField(default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "leave_request"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "-submitted_at"]),
            models.Index(fields=["status", "current_level"]),
            models.Index(fields=["org_id", "status"]),
        ]

    # Implements WorkflowSubject Protocol
    @property
    def employee(self):
        from modules.employee.models import Employee
        return Employee.all_objects.get(id=self.employee_id)

    def __str__(self) -> str:
        return f"LeaveRequest({self.employee_id}, {self.leave_type.code}, {self.start_date}..{self.end_date})"


class LeaveApproval(models.Model):
    APPROVAL_STATUSES: ClassVar[tuple] = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("delegated", "Delegated"),
        ("skipped", "Skipped"),
    )

    id = models.BigAutoField(primary_key=True)
    leave_request = models.ForeignKey(LeaveRequest, on_delete=models.CASCADE, related_name="approvals")
    level = models.IntegerField()
    approver_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=APPROVAL_STATUSES, default="pending")
    comment = models.TextField(blank=True)
    acted_at = models.DateTimeField(null=True, blank=True)
    delegated_to = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "leave_approval"
        indexes: ClassVar[list] = [
            models.Index(fields=["leave_request", "level"]),
            models.Index(fields=["approver_id", "status"]),
        ]
```

- [ ] **Step 3: Generate migration + run tests**

```
cd apps/api && uv run python manage.py makemigrations leave 2>&1 | tail -5 && uv run pytest modules/leave/tests/test_request_models.py -v 2>&1 | tail -10; cd ../..
```
Expected: 3 PASS.

- [ ] **Step 4: Commit**

```
git add apps/api/modules/leave/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): LeaveRequest + LeaveApproval models"
```

---

## Task 2: LeaveWorkflowService + chain + signals

**Files:**
- Create: `apps/api/modules/leave/chains.py`
- Create: `apps/api/modules/leave/services/workflow_adapter.py`
- Create: `apps/api/modules/leave/signals.py`
- Modify: `apps/api/modules/leave/apps.py` (call signals.ready())
- Create: `apps/api/modules/leave/tests/test_workflow_integration.py`

- [ ] **Step 1: Define the chain**

Create `apps/api/modules/leave/chains.py`:

```python
"""Pre-configured leave workflow chains."""
from common.workflow import ApprovalStep, DirectManagerResolver, WorkflowChain


# 1-step chain: leave goes straight to direct manager.
LEAVE_DEFAULT = WorkflowChain(
    code="leave_default",
    steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())],
)
```

- [ ] **Step 2: Implement `is_on_approved_leave`**

Append to `apps/api/modules/leave/services/leave_request.py` (create if not exists):

```python
"""LeaveRequestService — submit/approve/reject/cancel/withdraw, balance integration."""
from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from django.utils import timezone

from common.workflow import (
    Decision,
    NoApproverFound,
    NotAuthorizedToAct,
    WorkflowEngine,
)
from modules.identity.models import User

from ..chains import LEAVE_DEFAULT
from ..models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType
from .balance import BalanceService


def is_user_on_approved_leave(user: User, on_date: datetime.date) -> bool:
    """Lookup used by the workflow engine for the leave-fallback routing rule."""
    from modules.employee.models import Employee
    emp = Employee.all_objects.filter(user_id=user.id).first()
    if emp is None:
        return False
    return LeaveRequest.objects.filter(
        employee_id=emp.id,
        status="approved",
        start_date__lte=on_date,
        end_date__gte=on_date,
    ).exists()


class LeaveRequestService:
    @staticmethod
    def submit(request: LeaveRequest, actor: User) -> LeaveRequest:
        """Engine.submit + hold balance pending."""
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.submit(request, chain=LEAVE_DEFAULT)
        request.submitted_at = timezone.now()
        request.save(update_fields=["status", "current_level", "submitted_at", "updated_at"])

        # Hold the balance
        year = request.start_date.year
        BalanceService.hold_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )
        return request

    @staticmethod
    def act(request: LeaveRequest, actor: User, decision: Decision, comment: str = "") -> LeaveRequest:
        """Engine.act + balance update on terminal decisions."""
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.act(request, chain=LEAVE_DEFAULT, actor=actor, decision=decision, comment=comment)
        request.decided_at = timezone.now()
        request.decided_by = actor.id
        request.save(update_fields=["status", "current_level", "decided_at", "decided_by", "updated_at"])

        if request.status == "approved":
            year = request.start_date.year
            BalanceService.deduct(
                org_id=request.org_id,
                employee_id=request.employee_id,
                leave_type=request.leave_type,
                year=year,
                days=request.total_days,
                reference_type="leave_request",
                reference_id=request.id,
                actor_id=actor.id,
            )
        elif request.status == "rejected":
            year = request.start_date.year
            BalanceService.release_pending(
                org_id=request.org_id,
                employee_id=request.employee_id,
                leave_type=request.leave_type,
                year=year,
                days=request.total_days,
            )
        return request

    @staticmethod
    def cancel(request: LeaveRequest, actor: User) -> LeaveRequest:
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.cancel(request, actor=actor)
        request.save(update_fields=["status", "updated_at"])

        # Release pending if it was holding
        year = request.start_date.year
        BalanceService.release_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )
        return request

    @staticmethod
    def withdraw(request: LeaveRequest, actor: User) -> LeaveRequest:
        engine = WorkflowEngine(is_on_leave_lookup=is_user_on_approved_leave)
        engine.withdraw(request, actor=actor)
        request.save(update_fields=["status", "updated_at"])

        year = request.start_date.year
        BalanceService.release_pending(
            org_id=request.org_id,
            employee_id=request.employee_id,
            leave_type=request.leave_type,
            year=year,
            days=request.total_days,
        )
        return request
```

- [ ] **Step 3: Implement signals**

Create `apps/api/modules/leave/signals.py`:

```python
"""Leave-module signal handlers — record approval rows on workflow events."""
from __future__ import annotations

from django.dispatch import receiver
from django.utils import timezone

from common.workflow import (
    workflow_step_approved,
    workflow_step_rejected,
    workflow_submitted,
)

from .models import LeaveApproval, LeaveRequest


@receiver(workflow_submitted)
def _on_submitted(sender, subject, chain, **kwargs):
    """Create a pending LeaveApproval row at level 1 when a request is submitted."""
    if not isinstance(subject, LeaveRequest):
        return
    # Resolve the level-1 approver
    step = chain.get_step(1)
    if step is None:
        return
    approver = step.resolver.resolve(subject.employee, request=subject)
    if approver is None:
        return
    LeaveApproval.objects.create(
        leave_request=subject, level=1, approver_id=approver.id, status="pending"
    )


@receiver(workflow_step_approved)
def _on_step_approved(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, LeaveRequest):
        return
    LeaveApproval.objects.filter(
        leave_request=subject, level=level, status="pending"
    ).update(
        status="approved", acted_at=timezone.now(), comment=comment, approver_id=actor.id,
    )


@receiver(workflow_step_rejected)
def _on_step_rejected(sender, subject, chain, level, actor, comment, **kwargs):
    if not isinstance(subject, LeaveRequest):
        return
    LeaveApproval.objects.filter(
        leave_request=subject, level=level, status="pending"
    ).update(
        status="rejected", acted_at=timezone.now(), comment=comment, approver_id=actor.id,
    )
```

- [ ] **Step 4: Wire signals in `apps.py`**

Edit `apps/api/modules/leave/apps.py`:

```python
class LeaveConfig(AppConfig):
    name = "modules.leave"
    label = "leave"
    verbose_name = "Leave management"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
```

- [ ] **Step 5: Write integration tests**

Create `apps/api/modules/leave/tests/test_workflow_integration.py`:

```python
"""End-to-end leave workflow: submit, approve, reject, cancel."""
import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision, NotAuthorizedToAct
from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType
from modules.leave.services.balance import BalanceService
from modules.leave.services.leave_request import LeaveRequestService
from modules.organization.models import Department, Organization


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
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )

    mgr_user = User.objects.create_user(email="mgr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp_user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    def _employee(code, user, manager=None):
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

    mgr_emp = _employee("MGR", mgr_user)
    emp_emp = _employee("EMP", emp_user, manager=mgr_emp)

    # Pre-fund the balance
    BalanceService.accrue(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt, year=2026,
        days=Decimal("14"), reason="accrual",
    )
    return org, lt, mgr_user, emp_user, emp_emp


@pytest.mark.django_db
def test_submit_holds_balance_and_creates_pending_approval(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    req.refresh_from_db()
    assert req.status == "submitted"
    assert req.current_level == 1
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.pending == Decimal("3")
    assert bal.available == Decimal("11")
    assert LeaveApproval.objects.filter(leave_request=req, level=1, status="pending").count() == 1


@pytest.mark.django_db
def test_approve_terminal_deducts_balance(setup) -> None:
    org, lt, mgr_user, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.act(req, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    req.refresh_from_db()
    assert req.status == "approved"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.taken == Decimal("3")
    assert bal.pending == Decimal("0")


@pytest.mark.django_db
def test_reject_releases_balance(setup) -> None:
    org, lt, mgr_user, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.act(req, actor=mgr_user, decision=Decision.REJECT, comment="busy week")
    req.refresh_from_db()
    assert req.status == "rejected"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.taken == Decimal("0")
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_unauthorized_actor_rejected(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    # emp_user (the requester) is NOT the manager
    with pytest.raises(NotAuthorizedToAct):
        LeaveRequestService.act(req, actor=emp_user, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_cancel_releases_pending(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt,
        start_date=datetime.date(2026, 6, 1), end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"), is_half_day=False, reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.cancel(req, actor=emp_user)
    req.refresh_from_db()
    assert req.status == "cancelled"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")
```

- [ ] **Step 6: Run tests**

```
cd apps/api && uv run pytest modules/leave/tests/test_workflow_integration.py -v 2>&1 | tail -10; cd ../..
```
Expected: 5 PASS.

- [ ] **Step 7: Commit Task 2**

```
git add apps/api/modules/leave/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): WorkflowAdapter + signals + LEAVE_DEFAULT chain (submit/approve/reject/cancel)"
```

---

## Task 3: Endpoints

**Files:**
- Create: `apps/api/modules/leave/serializers.py`
- Create: `apps/api/modules/leave/views.py`
- Create: `apps/api/modules/leave/urls.py`
- Modify: `apps/api/hrms_api/urls.py` (mount `modules.leave.urls`)
- Create: `apps/api/modules/leave/tests/test_endpoints.py`

- [ ] **Step 1: Serializers**

Create `apps/api/modules/leave/serializers.py`:

```python
from rest_framework import serializers

from .models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ("id", "code", "name", "accrual_type", "default_days", "is_paid",
                  "requires_attachment", "max_consecutive_days", "min_advance_notice_days",
                  "is_statutory", "gender_restriction")


class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)
    available = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = LeaveBalance
        fields = ("id", "employee_id", "leave_type", "leave_type_code", "year",
                  "entitled", "accrued", "taken", "pending", "carried_forward", "available")
        read_only_fields = fields


class LeaveApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveApproval
        fields = ("id", "level", "approver_id", "status", "comment", "acted_at", "delegated_to")


class LeaveRequestSerializer(serializers.ModelSerializer):
    approvals = LeaveApprovalSerializer(many=True, read_only=True)
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = ("id", "org_id", "employee_id", "leave_type", "leave_type_code",
                  "start_date", "end_date", "total_days", "is_half_day", "half_day_period",
                  "reason", "attachment_url", "status", "current_level",
                  "submitted_at", "decided_at", "decided_by",
                  "approvals", "created_at", "updated_at")
        read_only_fields = ("id", "org_id", "employee_id", "status", "current_level",
                            "submitted_at", "decided_at", "decided_by",
                            "approvals", "created_at", "updated_at")


class LeaveActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")
```

- [ ] **Step 2: Views**

Create `apps/api/modules/leave/views.py`:

```python
"""Leave module views — types, balances, requests, approvals."""
from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from common.workflow import Decision
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import LeaveBalance, LeaveRequest, LeaveType
from .serializers import (
    LeaveActionSerializer,
    LeaveBalanceSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)
from .services.leave_request import LeaveRequestService


class LeaveTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeaveTypeSerializer
    permission_classes = [HRMSPermission]
    required_perms = ["leave:request:read:self"]

    def get_queryset(self):
        return LeaveType.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        ).order_by("code")


class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LeaveBalanceSerializer
    permission_classes = [HRMSPermission]

    @property
    def required_perms(self):
        return ["leave:balance:read:self"]

    def get_queryset(self):
        emp_id = self._employee_id_for_request()
        if emp_id is None:
            return LeaveBalance.all_objects.none()
        return LeaveBalance.all_objects.filter(
            org_id=self.request.user.org_id, employee_id=emp_id, deleted_at__isnull=True,
        )

    def _employee_id_for_request(self):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        return emp.id if emp else None

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)


class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [HRMSPermission]

    def get_required_perms(self):
        if self.action in ("create",):
            return ["leave:request:create:self"]
        if self.action in ("list", "retrieve"):
            return ["leave:request:read:self"]
        if self.action in ("submit", "withdraw", "cancel"):
            return ["leave:request:create:self"]
        if self.action in ("approve", "reject"):
            return ["leave:request:approve:team"]
        return []

    @property
    def required_perms(self):
        return self.get_required_perms()

    def get_queryset(self):
        scope = self.request.query_params.get("scope", "self")
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        qs = LeaveRequest.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True,
        )
        if scope == "self":
            return qs.filter(employee_id=emp.id if emp else None)
        # 'team' / 'all' scopes filtered later (RBAC enforcement happens via required_perms)
        return qs

    def perform_create(self, serializer):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")
        serializer.save(org_id=self.request.user.org_id, employee_id=emp.id)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.submit(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = self.get_object()
        ser = LeaveActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        LeaveRequestService.act(
            req, actor=request.user, decision=Decision.APPROVE,
            comment=ser.validated_data.get("comment", ""),
        )
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        req = self.get_object()
        ser = LeaveActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        comment = ser.validated_data.get("comment", "").strip()
        if not comment:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"comment": "Required when rejecting"})
        LeaveRequestService.act(
            req, actor=request.user, decision=Decision.REJECT,
            comment=comment,
        )
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.cancel(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], url_path="withdraw")
    def withdraw(self, request, pk=None):
        req = self.get_object()
        LeaveRequestService.withdraw(req, actor=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)
```

- [ ] **Step 3: URLs**

Create `apps/api/modules/leave/urls.py`:

```python
from rest_framework.routers import DefaultRouter

from .views import LeaveBalanceViewSet, LeaveRequestViewSet, LeaveTypeViewSet


router = DefaultRouter()
router.register(r"leave/types", LeaveTypeViewSet, basename="leave-type")
router.register(r"leave/balances", LeaveBalanceViewSet, basename="leave-balance")
router.register(r"leave/requests", LeaveRequestViewSet, basename="leave-request")
urlpatterns = router.urls
```

Modify `apps/api/hrms_api/urls.py`. Add to `api_v1_patterns`:
```python
    path("", include("modules.leave.urls")),
```

- [ ] **Step 4: Endpoint tests**

Create `apps/api/modules/leave/tests/test_endpoints.py`:

```python
"""Integration tests for /api/v1/leave/* endpoints."""
import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Department, Organization


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
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual",
        accrual_type="annual", default_days=Decimal("14"),
        is_paid=True, is_statutory=True, gender_restriction="any",
    )

    mgr_user = User.objects.create_user(email="mgr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp_user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in ("leave:request:read:self", "leave:request:read:team", "leave:request:approve:team",
                 "leave:balance:read:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)
    for code in ("leave:request:create:self", "leave:request:read:self", "leave:request:cancel:self",
                 "leave:balance:read:self"):
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

    BalanceService.accrue(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt, year=2026,
        days=Decimal("14"), reason="accrual",
    )

    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'emp@x.com')}")
    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'mgr@x.com')}")

    return org, dept, lt, emp_user, mgr_user, emp_emp, mgr_emp, emp_client, mgr_client


@pytest.mark.django_db
def test_get_leave_types(stack) -> None:
    *_, emp_client, _ = stack
    resp = emp_client.get("/api/v1/leave/types/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    assert any(r["code"] == "ANNUAL" for r in rows)


@pytest.mark.django_db
def test_get_my_balances(stack) -> None:
    *_, emp_client, _ = stack
    resp = emp_client.get("/api/v1/leave/balances/me/")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)
    assert any(r["leave_type_code"] == "ANNUAL" for r in rows)


@pytest.mark.django_db
def test_apply_submit_approve_flow(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, mgr_client = stack
    # 1. Create draft request
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id),
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "total_days": "3",
            "is_half_day": False,
            "reason": "Family trip",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    req_id = resp.json()["id"]

    # 2. Submit
    resp = emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"

    # 3. Manager approves
    resp = mgr_client.post(
        f"/api/v1/leave/requests/{req_id}/approve/",
        {"comment": "Enjoy"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "approved"


@pytest.mark.django_db
def test_reject_requires_comment(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, mgr_client = stack
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id), "start_date": "2026-06-01", "end_date": "2026-06-03",
            "total_days": "3", "is_half_day": False, "reason": "x",
        },
        format="json",
    )
    req_id = resp.json()["id"]
    emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")

    # Reject without comment
    resp = mgr_client.post(f"/api/v1/leave/requests/{req_id}/reject/", {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_employee_cannot_approve_own_request(stack) -> None:
    org, _, lt, _, _, emp_emp, _, emp_client, _ = stack
    resp = emp_client.post(
        "/api/v1/leave/requests/",
        {
            "leave_type": str(lt.id), "start_date": "2026-06-01", "end_date": "2026-06-03",
            "total_days": "3", "is_half_day": False, "reason": "x",
        },
        format="json",
    )
    req_id = resp.json()["id"]
    emp_client.post(f"/api/v1/leave/requests/{req_id}/submit/")

    resp = emp_client.post(f"/api/v1/leave/requests/{req_id}/approve/", {}, format="json")
    # 403 because employee role doesn't have leave:request:approve:team
    assert resp.status_code == 403
```

- [ ] **Step 5: Run tests + regen contracts**

```
cd apps/api && uv run pytest modules/leave/tests/test_endpoints.py -v 2>&1 | tail -10; cd ../..
sg docker -c 'make contracts' 2>&1 | tail -3
```
Expected: 5 PASS. Contracts regenerated.

- [ ] **Step 6: Commit Task 3**

```
git add apps/api/modules/leave/ apps/api/hrms_api/urls.py packages/contracts/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(leave): /api/v1/leave/{types,balances,requests} endpoints with action verbs"
```

---

## M3c Acceptance Criteria

- [ ] LeaveRequest + LeaveApproval models migrated
- [ ] LeaveRequestService.{submit,act,cancel,withdraw} drives the workflow engine + balance updates
- [ ] LEAVE_DEFAULT chain works end-to-end (submit → mgr approves → balance deducts)
- [ ] Reject releases pending balance
- [ ] Cancel/withdraw release pending balance
- [ ] `is_user_on_approved_leave` correctly identifies users on approved leave for routing fallback
- [ ] LeaveApproval rows created on submit + updated on act
- [ ] `/api/v1/leave/{types,balances,requests}/` endpoints work
- [ ] `/api/v1/leave/requests/{id}/{submit,approve,reject,cancel,withdraw}/` actions work
- [ ] Reject requires comment
- [ ] Employee can't approve their own request (RBAC)
- [ ] All M3c tests green; full backend suite green
- [ ] `manage.py check` clean
- [ ] Pre-commit clean

That is M3c. Next plan: **M3d — Frontend leave UI + tag v0.1.0-m3**.
