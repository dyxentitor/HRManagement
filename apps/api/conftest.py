"""pytest fixtures shared across all tests."""

from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest
from django.utils import timezone


@pytest.fixture(autouse=True)
def _test_env(tmp_path, settings, monkeypatch):
    """Per-test isolation: uploads go to a tmp dir, and API rate-limiting is off.

    DRF binds throttle rates as a *class attribute at import time*, so overriding
    them via settings at runtime doesn't take effect. Patch the throttle directly
    so login/MFA/password tests (and any fixture that logs in repeatedly) never
    hit 429. The cache is left intact so perm-cache tests still work.
    """
    settings.MEDIA_ROOT = tmp_path / "media"

    from rest_framework.throttling import SimpleRateThrottle

    monkeypatch.setattr(SimpleRateThrottle, "allow_request", lambda self, request, view: True)


# ---------------------------------------------------------------------------
# swap_env — shared by modules/schedule/tests/ and modules/dashboard/tests/.
# Kept here (api-level conftest) so both packages discover it via pytest's
# upward conftest walk without any cross-package import tricks.
# ---------------------------------------------------------------------------


def _make_employee(org, dept, **overrides):
    from modules.employee.models import Employee

    defaults = dict(
        org_id=org.id,
        employee_code="UNSET",
        first_name="A",
        last_name="B",
        email="a@b.com",
        phone="+60100000000",
        date_of_birth="1990-01-01",
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="KL",
        state="KL",
        postcode="50000",
        country_code="MY",
        hire_date="2024-01-01",
        employment_type="fulltime",
        role_title="Eng",
        status="active",
        department=dept,
        bank_name="X",
        emergency_contact_name="X",
        emergency_contact_relationship="self",
        emergency_contact_phone="+60100000099",
    )
    defaults.update(overrides)
    return Employee.all_objects.create(**defaults)


def _grant_swap(org, user, codes):
    from modules.identity.models import Permission, Role, RolePermission, UserRole

    role = Role.objects.create(
        org_id=org.id, code=f"r-{user.email}", name="R", is_system=False
    )
    for c in codes:
        p, _ = Permission.objects.get_or_create(code=c)
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role)
    return role


@pytest.fixture
def swap_env(db):
    from common.managers import set_current_org_id
    from modules.identity.models import User
    from modules.organization.models import Department, Organization
    from modules.schedule.models import Shift, ShiftAssignment

    org = Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    set_current_org_id(org.id)
    dept = Department.all_objects.create(org_id=org.id, name="Ops")

    user_a = User.objects.create_user(email="a@a.com", password="p!", org_id=org.id)
    user_b = User.objects.create_user(email="b@b.com", password="p!", org_id=org.id)
    user_mgr = User.objects.create_user(email="m@m.com", password="p!", org_id=org.id)

    _grant_swap(org, user_a, ["schedule:swap:request:self", "schedule:assignment:read:self"])
    _grant_swap(org, user_b, ["schedule:swap:request:self", "schedule:assignment:read:self"])
    _grant_swap(org, user_mgr, ["schedule:swap:approve:team"])

    mgr_emp = _make_employee(
        org, dept, employee_code="MGR", first_name="M",
        email="m@m.com", phone="+60100000009",
        emergency_contact_phone="+60100000089", user=user_mgr,
    )
    emp_a = _make_employee(
        org, dept, employee_code="E1", first_name="A",
        email="a@a.com", phone="+60100000001",
        emergency_contact_phone="+60100000091", user=user_a, manager=mgr_emp,
    )
    emp_b = _make_employee(
        org, dept, employee_code="E2", first_name="B",
        email="b@b.com", phone="+60100000002",
        emergency_contact_phone="+60100000092", user=user_b, manager=mgr_emp,
    )
    emp_c = _make_employee(
        org, dept, employee_code="E3", first_name="C",
        email="c@c.com", phone="+60100000003",
        emergency_contact_phone="+60100000093",
    )

    shift_day = Shift.all_objects.create(
        org_id=org.id, name="Day", code="D",
        start_time=dt.time(9, 0), end_time=dt.time(18, 0),
    )
    shift_night = Shift.all_objects.create(
        org_id=org.id, name="Night", code="N",
        start_time=dt.time(21, 0), end_time=dt.time(6, 0), crosses_midnight=True,
    )

    def make_assignment(emp, date, shift, *, published=True, status="scheduled"):
        return ShiftAssignment.all_objects.create(
            org_id=org.id,
            employee=emp,
            shift=shift,
            work_date=date,
            status=status,
            assigned_by=user_mgr.id,
            published_at=timezone.now() if published else None,
        )

    return SimpleNamespace(
        org=org, dept=dept,
        shift_day=shift_day, shift_night=shift_night,
        emp_a=emp_a, emp_b=emp_b, emp_c=emp_c, mgr_emp=mgr_emp,
        user_a=user_a, user_b=user_b, user_mgr=user_mgr,
        make_assignment=make_assignment,
    )
