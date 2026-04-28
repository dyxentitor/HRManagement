# HRMS M10 — Dashboards + Unified Approvals Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace M3d's `/leave/approvals` and M5b's `/claims/finance` separate queues with a single unified `/approvals` page that merges leave + claims by approver. Add role-aware dashboards composed of small reusable cards.

**Architecture:**
- New module: `apps/api/modules/dashboard/`
- `/approvals/inbox` is a server-side merge of `LeaveRequest(status='submitted', approver=user)` + `ClaimRequest(status in ['submitted','manager_approved'], approver=user)`. Uses the `LeaveApproval`/`ClaimApproval` rows where `status='pending'` AND `approver_id == request.user.id`.
- `/dashboards/{me,team,admin}` returns a `cards: [{type, data}, ...]` payload — role-filtered server-side. Each card type has a small data-fetcher in `dashboard/services/cards/<type>.py`.
- Frontend `DashboardPage` introspects `cards[]` and renders the matching component per card type.

**Spec reference:** spec §4 (`/approvals/inbox`, `/dashboards/*`), §7 (dashboard cards pattern).

**Branch:** `m10/dashboards` from master.

---

## File structure

```
apps/api/modules/dashboard/                   NEW
├── __init__.py, apps.py
├── services/
│   ├── __init__.py
│   ├── inbox.py                               unified leave + claims merge
│   ├── cards/
│   │   ├── __init__.py                        registry: CARD_TYPES = {...}
│   │   ├── base.py                            Card base class
│   │   ├── pending_approvals.py
│   │   ├── my_leave_balance.py
│   │   ├── upcoming_holidays.py
│   │   ├── certs_expiring_team.py
│   │   ├── kpi_cycle_progress_team.py
│   │   ├── today_attendance_team.py
│   │   ├── recent_claims_self.py
│   │   └── birthdays_this_month.py
│   └── role_filter.py                         which cards for which dashboard variant
├── serializers.py, views.py, urls.py
├── migrations/  (empty — no models)
└── tests/

apps/web/src/modules/dashboard/                NEW
├── api.ts, routes.tsx
├── pages/DashboardPage.tsx                    role-aware
└── components/cards/
    ├── PendingApprovalsCard.tsx
    ├── LeaveBalanceCard.tsx
    └── ...

apps/web/src/modules/approvals/                NEW (replaces split inboxes)
├── api.ts, routes.tsx
└── pages/UnifiedInboxPage.tsx

apps/api/modules/identity/fixtures/permissions_m10.yaml  NEW (~3 codes)
```

---

## Task 1: Branch + dashboard/approvals module skeleton + permissions

- [ ] **Step 1: Branch + skeleton**

```
git checkout master
git checkout -b m10/dashboards
mkdir -p apps/api/modules/dashboard/{services/cards,tests,migrations}
touch apps/api/modules/dashboard/__init__.py \
      apps/api/modules/dashboard/services/__init__.py \
      apps/api/modules/dashboard/services/cards/__init__.py \
      apps/api/modules/dashboard/migrations/__init__.py \
      apps/api/modules/dashboard/tests/__init__.py
```

- [ ] **Step 2: AppConfig**

```python
# apps.py
from django.apps import AppConfig


class DashboardConfig(AppConfig):
    name = "modules.dashboard"
    label = "dashboard"
    verbose_name = "Dashboards & Approvals Inbox"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Permission codes**

`permissions_m10.yaml`:
```yaml
- { code: "dashboard:read:me",       description: Read own dashboard }
- { code: "dashboard:read:team",     description: Read team dashboard (manager) }
- { code: "dashboard:read:admin",    description: Read admin dashboard (HR) }
- { code: "approvals:inbox:read",    description: Read unified approvals inbox }
```

(4 codes — threshold ≥ 101.)

Update `default_roles.yaml`:
- All roles: `dashboard:read:me`
- `manager`/`team_lead`/`hr_manager`/`org_admin`: `dashboard:read:team`, `approvals:inbox:read`
- `hr_manager`/`org_admin`: `dashboard:read:admin`
- `auditor`: read-only access to all dashboards

Update `test_seed_commands.py` threshold ≥ 101.

- [ ] **Step 4: Register app + commit**

Edit `settings/base.py`. Add `"modules.dashboard",` after `"modules.notification",`.

```
cd apps/api && uv run python manage.py check 2>&1 | tail -3 && uv run pytest modules/identity/tests/test_seed_commands.py -v 2>&1 | tail -10; cd ../..

git add apps/api/modules/dashboard/ apps/api/modules/identity/fixtures/ apps/api/modules/identity/tests/test_seed_commands.py apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(dashboard): module skeleton + M10 permission codes"
```

---

## Task 2: Unified approvals inbox service + endpoint

**Files:**
- Create: `apps/api/modules/dashboard/services/inbox.py`
- Create: `apps/api/modules/dashboard/serializers.py`
- Create: `apps/api/modules/dashboard/views.py`
- Create: `apps/api/modules/dashboard/urls.py`
- Modify: `apps/api/hrms_api/urls.py`
- Create: `apps/api/modules/dashboard/tests/test_inbox.py`

- [ ] **Step 1: Inbox service**

```python
# services/inbox.py
"""Unified approvals inbox — merges pending leave + claim approvals for a user."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from modules.claims.models import ClaimApproval, ClaimRequest
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveRequest


@dataclass
class InboxItem:
    kind: str           # 'leave' or 'claim'
    id: str             # request id
    employee_code: str
    summary: str        # human-readable summary
    submitted_at: datetime | None
    deep_link: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind, "id": self.id,
            "employee_code": self.employee_code, "summary": self.summary,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "deep_link": self.deep_link,
        }


def get_inbox(*, user: User) -> list[InboxItem]:
    """Pending leave + claim items where this user is the current approver."""
    items: list[InboxItem] = []

    # Leave: requests where the user is the approver of a pending LeaveApproval row
    pending_leave_ids = LeaveApproval.objects.filter(
        approver_id=user.id, status="pending",
    ).values_list("leave_request_id", flat=True)
    leave_qs = (
        LeaveRequest.all_objects.filter(
            id__in=pending_leave_ids, status="submitted", deleted_at__isnull=True,
        )
        .select_related("employee", "leave_type")
    )
    for r in leave_qs:
        items.append(InboxItem(
            kind="leave", id=str(r.id),
            employee_code=r.employee.employee_code,
            summary=f"{r.leave_type.code} — {r.total_days} day(s) ({r.start_date} to {r.end_date})",
            submitted_at=r.submitted_at,
            deep_link=f"/approvals?focus={r.id}",
        ))

    # Claims: same pattern
    pending_claim_ids = ClaimApproval.objects.filter(
        approver_id=user.id, status="pending",
    ).values_list("claim_id", flat=True)
    claim_qs = (
        ClaimRequest.all_objects.filter(
            id__in=pending_claim_ids,
            status__in=("submitted", "manager_approved"),
            deleted_at__isnull=True,
        )
        .select_related("employee", "category")
    )
    for c in claim_qs:
        items.append(InboxItem(
            kind="claim", id=str(c.id),
            employee_code=c.employee.employee_code,
            summary=f"{c.category.code} — {c.currency_code} {c.amount} ({c.expense_date})",
            submitted_at=c.submitted_at,
            deep_link=f"/approvals?focus={c.id}",
        ))

    items.sort(key=lambda i: i.submitted_at or datetime.min, reverse=True)
    return items
```

- [ ] **Step 2: View + URL**

```python
# views.py (partial — inbox part)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .services.inbox import get_inbox


class _InboxPermission(HRMSPermission):
    required_perms = ["approvals:inbox:read"]


@api_view(["GET"])
@permission_classes([_InboxPermission])
def approvals_inbox(request):
    items = get_inbox(user=request.user)
    return Response([i.to_dict() for i in items])
```

```python
# urls.py
from django.urls import path

from .views import approvals_inbox


urlpatterns = [
    path("approvals/inbox", approvals_inbox, name="approvals-inbox"),
]
```

Mount in `hrms_api/urls.py` (`api_v1_patterns`).

- [ ] **Step 3: Tests**

`tests/test_inbox.py`: ~5 tests covering — manager sees direct-report's pending leave; finance sees finance-step claim; mixed leave+claim sorted by submitted_at desc; user with no pending → empty list; cross-org isolation.

- [ ] **Step 4: Commit**

```
git add apps/api/modules/dashboard/ apps/api/hrms_api/urls.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(dashboard): /api/v1/approvals/inbox unified leave + claims queue"
```

---

## Task 3: Dashboard cards + role-filtered endpoint

**Files:**
- Create: `apps/api/modules/dashboard/services/cards/{base.py, pending_approvals.py, my_leave_balance.py, upcoming_holidays.py, certs_expiring_team.py, kpi_cycle_progress_team.py, today_attendance_team.py, recent_claims_self.py, birthdays_this_month.py}`
- Create: `apps/api/modules/dashboard/services/role_filter.py`
- Modify: `apps/api/modules/dashboard/views.py` (add dashboards endpoint)
- Create: `apps/api/modules/dashboard/tests/test_dashboards.py`

- [ ] **Step 1: Card base + registry**

`services/cards/base.py`:

```python
"""Card base class + registry."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from modules.identity.models import User


class Card(ABC):
    type: ClassVar[str]
    requires_perms: ClassVar[list[str]] = []

    @classmethod
    def is_visible_for(cls, user: User) -> bool:
        from modules.identity.services.permissions import get_user_perms
        if not cls.requires_perms:
            return True
        perms = get_user_perms(user)
        return all(p in perms for p in cls.requires_perms)

    @classmethod
    @abstractmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        """Return the card's data dict. Frontend renders by `type`."""
        ...
```

`services/cards/__init__.py`:

```python
"""Card registry — import each card type."""
from .base import Card
from .birthdays_this_month import BirthdaysThisMonth
from .certs_expiring_team import CertsExpiringTeam
from .kpi_cycle_progress_team import KpiCycleProgressTeam
from .my_leave_balance import MyLeaveBalance
from .pending_approvals import PendingApprovals
from .recent_claims_self import RecentClaimsSelf
from .today_attendance_team import TodayAttendanceTeam
from .upcoming_holidays import UpcomingHolidays


CARD_TYPES: dict[str, type[Card]] = {
    cls.type: cls for cls in (
        PendingApprovals, MyLeaveBalance, UpcomingHolidays,
        CertsExpiringTeam, KpiCycleProgressTeam, TodayAttendanceTeam,
        RecentClaimsSelf, BirthdaysThisMonth,
    )
}
```

- [ ] **Step 2: Implement each card** (1 file each, ~25 lines)

Example `cards/pending_approvals.py`:

```python
"""PendingApprovals card — count of pending items in user's inbox."""
from __future__ import annotations

from typing import Any

from modules.dashboard.services.inbox import get_inbox

from .base import Card


class PendingApprovals(Card):
    type: str = "pending_approvals"
    requires_perms: list[str] = ["approvals:inbox:read"]

    @classmethod
    def fetch(cls, user) -> dict[str, Any]:
        items = get_inbox(user=user)
        return {
            "type": cls.type,
            "title": "Pending approvals",
            "data": {
                "count": len(items),
                "items": [i.to_dict() for i in items[:5]],
            },
        }
```

`cards/my_leave_balance.py`:

```python
"""MyLeaveBalance — list of own leave balances."""
from __future__ import annotations

import datetime
from typing import Any

from modules.employee.models import Employee
from modules.leave.models import LeaveBalance

from .base import Card


class MyLeaveBalance(Card):
    type: str = "my_leave_balance"
    requires_perms: list[str] = ["leave:balance:read:self"]

    @classmethod
    def fetch(cls, user) -> dict[str, Any]:
        emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        if emp is None:
            return {"type": cls.type, "title": "My leave balance", "data": {"balances": []}}
        year = datetime.date.today().year
        balances = (
            LeaveBalance.all_objects.filter(employee_id=emp.id, year=year, deleted_at__isnull=True)
            .select_related("leave_type")
        )
        return {
            "type": cls.type,
            "title": "My leave balance",
            "data": {
                "year": year,
                "balances": [
                    {
                        "code": b.leave_type.code,
                        "available": str(b.available),
                        "entitled": str(b.entitled),
                        "taken": str(b.taken),
                    }
                    for b in balances
                ],
            },
        }
```

(Implement the remaining 6 cards in similar 25-line files. They all follow the pattern: query data, return `{type, title, data}` dict.)

- [ ] **Step 3: Role filter + dashboards endpoint**

`services/role_filter.py`:

```python
"""Per-dashboard-variant card list."""
from __future__ import annotations


# Cards per dashboard variant (in display order)
DASHBOARD_CARDS: dict[str, list[str]] = {
    "me": [
        "my_leave_balance",
        "upcoming_holidays",
        "recent_claims_self",
        "birthdays_this_month",
    ],
    "team": [
        "pending_approvals",
        "today_attendance_team",
        "certs_expiring_team",
        "kpi_cycle_progress_team",
        "my_leave_balance",
        "upcoming_holidays",
    ],
    "admin": [
        "pending_approvals",
        "today_attendance_team",
        "certs_expiring_team",
        "kpi_cycle_progress_team",
        "birthdays_this_month",
        "upcoming_holidays",
    ],
}
```

Add to `views.py`:

```python
from .services.cards import CARD_TYPES
from .services.role_filter import DASHBOARD_CARDS


class _DashboardPermission(HRMSPermission):
    """variant-aware: dashboard:read:me/team/admin."""
    def __init__(self, variant: str) -> None:
        self.required_perms = [f"dashboard:read:{variant}"]


@api_view(["GET"])
@permission_classes([HRMSPermission])  # tighten via has_permission below
def dashboard(request, variant: str):
    if variant not in DASHBOARD_CARDS:
        from rest_framework.exceptions import NotFound
        raise NotFound(f"Unknown dashboard variant: {variant}")

    # Permission check
    from modules.identity.services.permissions import get_user_perms
    if f"dashboard:read:{variant}" not in get_user_perms(request.user):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied()

    cards = []
    for type_code in DASHBOARD_CARDS[variant]:
        cls = CARD_TYPES.get(type_code)
        if cls is None or not cls.is_visible_for(request.user):
            continue
        cards.append(cls.fetch(request.user))
    return Response({"variant": variant, "cards": cards})
```

URLs:

```python
urlpatterns += [
    path("dashboards/<str:variant>", dashboard, name="dashboard"),
]
```

- [ ] **Step 4: Tests**

`tests/test_dashboards.py`: ~6 tests covering — me dashboard returns 4 cards for employee; team dashboard returns 6 cards for manager; admin denied for employee role; cards filtered by `is_visible_for`; unknown variant → 404; data shape per card.

- [ ] **Step 5: Commit**

```
git add apps/api/modules/dashboard/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(dashboard): card catalogue + /api/v1/dashboards/{me,team,admin} endpoints"
```

---

## Task 4: Frontend — UnifiedInboxPage

**Files:**
- Create: `apps/web/src/modules/approvals/{api.ts, routes.tsx, pages/UnifiedInboxPage.tsx}`
- Modify: `apps/web/src/App.tsx` (mount + redirect old paths)
- Modify: `apps/web/src/components/shell/TopBar.tsx` (replace separate inbox links with single "Approvals")

`UnifiedInboxPage`: renders the inbox list grouped by kind. Click a row → expand drawer with full request detail (fetched via `/leave/requests/{id}` or `/claims/{id}`) + Approve/Reject buttons that call the kind-specific endpoint.

Build, commit: `feat(web): UnifiedInboxPage replacing separate leave + finance inboxes`

---

## Task 5: Frontend — DashboardPage

**Files:**
- Create: `apps/web/src/modules/dashboard/{api.ts, routes.tsx, pages/DashboardPage.tsx}`
- Create: `apps/web/src/modules/dashboard/components/cards/{PendingApprovalsCard, LeaveBalanceCard, UpcomingHolidaysCard, CertsExpiringCard, KpiProgressCard, TodayAttendanceCard, RecentClaimsCard, BirthdaysCard}.tsx`
- Modify: `apps/web/src/App.tsx` — replace HomePage with DashboardPage at `/`

`DashboardPage`: fetches `/dashboards/me` (or `/team`, `/admin` based on role + URL); maps `cards[]` to components by `card.type`. Each card component receives `card.data` as its prop.

Build, commit: `feat(web): role-aware DashboardPage with 8 reusable cards`

---

## Task 6: M10 close

- CHANGELOG `[0.1.0-m10] - 2026-04-28` block
- Tag `v0.1.0-m10`
- FF-merge to master, delete `m10/dashboards`

---

## M10 Acceptance Criteria

- [ ] `/api/v1/approvals/inbox` returns merged leave + claim items for the user
- [ ] `/api/v1/dashboards/me` returns 4 cards for an employee role
- [ ] `/api/v1/dashboards/team` returns 6 cards for a manager role; denied for employee role
- [ ] `/api/v1/dashboards/admin` only allowed for hr_manager/org_admin
- [ ] Frontend `/approvals` page replaces M3d's `/leave/approvals` and M5b's `/claims/finance` (those routes redirect)
- [ ] Frontend `/` page (DashboardPage) renders the cards
- [ ] Permission catalogue ≥ 101
- [ ] All M10 tests green; full backend + frontend suites green
- [ ] 11 tags total

That closes M10. Next: **M11 — Reports**.
