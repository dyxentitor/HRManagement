"""Tests for KPI cycle-open notification fan-outs.

TDD: test_open_self_review_notifies_participants and
test_open_manager_review_notifies_managers are written first (Step 1),
run to confirm FAIL (module missing), then the service is implemented.
"""

from __future__ import annotations

import datetime
import uuid
import os

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.identity.models import User
from modules.kpi.models import KpiAssignment, KpiCycle, KpiTemplate
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


# ── Encryption key fixture (required for Employee EncryptedCharField) ────────


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


# ── Shared helpers ───────────────────────────────────────────────────────────


def _make_org() -> Organization:
    slug = f"kpi-notify-{uuid.uuid4().hex[:8]}"
    return Organization.objects.create(
        name="KPI Notify Org",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _make_user(org_id, email_prefix: str) -> User:
    """Create a User (post_save signal auto-seeds notification prefs)."""
    return User.objects.create_user(
        email=f"{email_prefix}@kpinotify.test",
        password="x",  # pragma: allowlist secret
        org_id=org_id,
    )


def _make_employee(*, org, user: User, code: str, manager: Employee | None = None) -> Employee:
    """Minimal valid Employee row linked to a User (mirrors seed_demo_data semantics)."""
    dept, _ = Department.objects.get_or_create(
        org_id=org.id,
        name="KPI Dept",
    )
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="Test",
        email=user.email,
        department=dept,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        manager=manager,
    )


def _make_cycle(org_id) -> KpiCycle:
    return KpiCycle.all_objects.create(
        org_id=org_id,
        name="Q1 2026 Notify",
        type="quarterly",
        starts_on="2026-01-01",
        ends_on="2026-03-31",
        review_opens_on="2026-04-01",
        review_closes_on="2026-04-15",
        status="upcoming",
    )


def _make_template(org_id) -> KpiTemplate:
    return KpiTemplate.all_objects.create(org_id=org_id, name="Notify Test KPIs")


@pytest.fixture
def make_kpi_cycle_with_assignments():
    """Factory fixture: returns (cycle, [employees]) where employees have
    linked Users (post_save auto-seeds notification prefs) and share a common
    manager (also with a linked User).
    """

    def _factory(n: int = 2):
        org = _make_org()
        template = _make_template(org.id)
        cycle = _make_cycle(org.id)

        # Manager: has a linked user so manager-review fan-out has a recipient
        mgr_user = _make_user(org.id, "mgr")
        manager_emp = _make_employee(org=org, user=mgr_user, code="MGR001")

        employees = []
        for i in range(n):
            u = _make_user(org.id, f"emp{i}")
            emp = _make_employee(org=org, user=u, code=f"EMP{i:03d}", manager=manager_emp)
            KpiAssignment.all_objects.create(
                org_id=org.id,
                cycle=cycle,
                employee_id=emp.id,  # ← Employee.id, not User.id (§3.15)
                template=template,
                kpis=[],
            )
            employees.append(emp)

        return cycle, employees

    return _factory


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_open_self_review_notifies_participants(make_kpi_cycle_with_assignments):
    """notify_cycle_self_review fans out one in-app row per participant."""
    cycle, employees = make_kpi_cycle_with_assignments(n=2)
    from modules.kpi.services.notify_cycle import notify_cycle_self_review

    sent = notify_cycle_self_review(cycle)

    assert sent == 2
    assert (
        Notification.objects.filter(
            type="kpi.cycle_opens_self_review",
            user__in=[e.user for e in employees],
        ).count()
        >= 2
    )


@pytest.mark.django_db
def test_open_manager_review_notifies_managers(make_kpi_cycle_with_assignments):
    """notify_cycle_manager_review fans out exactly one row per distinct manager."""
    cycle, employees = make_kpi_cycle_with_assignments(n=2)
    from modules.kpi.services.notify_cycle import notify_cycle_manager_review

    # Both employees share the same manager; only one notification should fire.
    sent = notify_cycle_manager_review(cycle)

    assert sent == 1
    # Manager's user is employees[0].manager.user
    mgr_user = employees[0].manager.user
    assert (
        Notification.objects.filter(
            type="kpi.cycle_opens_manager_review",
            user=mgr_user,
        ).count()
        >= 1
    )


@pytest.mark.django_db
def test_self_review_skips_employee_without_linked_user(make_kpi_cycle_with_assignments):
    """An employee with no linked user (user=None) is silently skipped."""
    cycle, employees = make_kpi_cycle_with_assignments(n=1)
    from modules.kpi.services.notify_cycle import notify_cycle_self_review

    # Detach the user from the employee
    emp = employees[0]
    emp.user = None
    emp.save(update_fields=["user"])

    sent = notify_cycle_self_review(cycle)
    assert sent == 0


@pytest.mark.django_db
def test_manager_review_skips_employee_without_manager(make_kpi_cycle_with_assignments):
    """An employee with no manager is silently skipped for manager-review notify."""
    cycle, employees = make_kpi_cycle_with_assignments(n=1)
    from modules.kpi.services.notify_cycle import notify_cycle_manager_review

    # Remove manager from employee
    emp = employees[0]
    emp.manager = None
    emp.save(update_fields=["manager"])

    sent = notify_cycle_manager_review(cycle)
    assert sent == 0
