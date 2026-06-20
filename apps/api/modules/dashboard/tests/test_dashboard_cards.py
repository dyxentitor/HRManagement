"""Unit tests for the v1.12.0 operational dashboard cards."""

from __future__ import annotations

import datetime
import uuid

import pytest

from common.audit.models import AuditLog
from modules.announcements.models import Announcement
from modules.attendance.models import AttendanceRecord
from modules.dashboard.services.cards.activity_feed import ActivityFeed
from modules.dashboard.services.cards.attendance_summary import AttendanceSummary
from modules.dashboard.services.cards.company_announcements import CompanyAnnouncements
from modules.dashboard.services.cards.department_overview import DepartmentOverview
from modules.dashboard.services.cards.employee_snapshot import EmployeeSnapshot
from modules.dashboard.services.cards.hero_summary import HeroSummary
from modules.dashboard.services.cards.payroll_status import PayrollStatus
from modules.dashboard.services.cards.pending_tasks import PendingTasks
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.payslip.models import PayrollException, PayrollPeriod


def _grant(user, *codes):
    org_id = user.org_id
    role = Role.objects.create(
        org_id=org_id, code=f"r_{uuid.uuid4().hex[:8]}", name="r", is_system=False
    )
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)


def _emp(org, dept, code, status="active", manager=None, user=None, **extra):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="T",
        email=f"{code.lower()}@x.com",
        hire_date=datetime.date(2024, 1, 1),
        employment_type="fulltime",
        department=dept,
        manager=manager,
        status=status,
        **extra,
    )


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X",
        slug=f"x-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def admin_user(org):
    u = User.objects.create_user(
        email=f"a_{uuid.uuid4().hex[:6]}@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    return u


@pytest.mark.django_db
def test_hero_summary_payroll_countdown(org, admin_user):
    today = datetime.date.today()
    PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=today,
        period_end=today + datetime.timedelta(days=20),
        period_type="monthly",
        pay_date=today + datetime.timedelta(days=5),
        status="processing",
    )
    out = HeroSummary.fetch(admin_user)["data"]
    assert out["days_to_payroll"] == 5
    assert out["working_day"] == today.strftime("%A")


@pytest.mark.django_db
def test_employee_snapshot_counts(org, admin_user):
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    _emp(org, dept, "A1", status="active")
    _emp(org, dept, "A2", status="active")
    _emp(org, dept, "P1", status="probation")
    _emp(org, dept, "L1", status="on_leave")
    _emp(org, dept, "R1", status="resigned", resignation_date=datetime.date.today())
    out = EmployeeSnapshot.fetch(admin_user)["data"]
    assert out["active"] == 2
    assert out["on_probation"] == 1
    assert out["on_leave"] == 1
    assert out["resigned_this_month"] == 1


@pytest.mark.django_db
def test_attendance_summary_org_scope(org, admin_user):
    _grant(admin_user, "attendance:read:org")
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    e1 = _emp(org, dept, "E1")
    e2 = _emp(org, dept, "E2")
    today = datetime.date.today()
    AttendanceRecord.all_objects.create(
        org_id=org.id, employee=e1, work_date=today, status="present"
    )
    AttendanceRecord.all_objects.create(org_id=org.id, employee=e2, work_date=today, status="late")
    out = AttendanceSummary.fetch(admin_user)["data"]
    assert out["present"] == 1
    assert out["late"] == 1
    assert out["team_size"] == 2


@pytest.mark.django_db
def test_payroll_status_stages(org, admin_user):
    today = datetime.date.today()
    PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=today,
        period_end=today,
        period_type="monthly",
        pay_date=today,
        status="ready",
    )
    out = PayrollStatus.fetch(admin_user)["data"]
    assert out["current"] == "ready"
    states = {s["key"]: s["state"] for s in out["stages"]}
    assert states["draft"] == "done"
    assert states["approved"] == "done"
    assert states["ready"] == "current"
    assert states["processing"] == "upcoming"
    assert states["completed"] == "upcoming"


@pytest.mark.django_db
def test_department_overview_counts(org, admin_user):
    d1 = Department.all_objects.create(org_id=org.id, name="Eng")
    d2 = Department.all_objects.create(org_id=org.id, name="Ops")
    _emp(org, d1, "E1")
    _emp(org, d1, "E2")
    _emp(org, d2, "O1")
    out = DepartmentOverview.fetch(admin_user)["data"]
    by_name = {d["name"]: d["count"] for d in out["departments"]}
    assert by_name == {"Eng": 2, "Ops": 1}


@pytest.mark.django_db
def test_company_announcements_pinned_first_and_expiry(org, admin_user):
    from django.utils import timezone

    Announcement.all_objects.create(org_id=org.id, title="plain", body="b", pinned=False)
    Announcement.all_objects.create(org_id=org.id, title="pinned", body="b", pinned=True)
    Announcement.all_objects.create(
        org_id=org.id,
        title="expired",
        body="b",
        expires_at=timezone.now() - datetime.timedelta(days=1),
    )
    out = CompanyAnnouncements.fetch(admin_user)["data"]
    titles = [i["title"] for i in out["items"]]
    assert titles[0] == "pinned"
    assert "expired" not in titles


@pytest.mark.django_db
def test_activity_feed_resolves_actor(org, admin_user):
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    actor = User.objects.create_user(
        email="actor@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    _emp(org, dept, "John", user=actor)
    AuditLog.objects.create(
        org_id=org.id,
        actor_id=actor.id,
        action="submit",
        entity="leave_request",
        entity_id=uuid.uuid4(),
    )
    out = ActivityFeed.fetch(admin_user)["data"]
    assert out["items"][0]["actor"] == "John T"
    assert out["items"][0]["action"] == "submit"


@pytest.mark.django_db
def test_pending_tasks_perm_gated(org, admin_user):
    # No perms granted → no tasks
    assert PendingTasks.fetch(admin_user)["data"]["tasks"] == []

    _grant(admin_user, "payroll:exception:read")
    period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date.today(),
        period_end=datetime.date.today(),
        period_type="monthly",
        pay_date=datetime.date.today(),
    )
    PayrollException.all_objects.create(
        org_id=org.id, period=period, kind="other", message="x", status="open"
    )
    tasks = {t["key"]: t for t in PendingTasks.fetch(admin_user)["data"]["tasks"]}
    assert "payroll_exceptions" in tasks
    assert tasks["payroll_exceptions"]["count"] == 1
    assert tasks["payroll_exceptions"]["action_route"] == "/payroll/admin"
