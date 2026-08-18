"""Shared fixtures for schedule tests, incl. the shift-swap suite."""

from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest
from django.utils import timezone

from common.managers import set_current_org_id
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift, ShiftAssignment


def _make_employee(org, dept, **overrides):
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


def _grant(org, user, codes):
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

    _grant(org, user_a, ["schedule:swap:request:self", "schedule:assignment:read:self"])
    _grant(org, user_b, ["schedule:swap:request:self", "schedule:assignment:read:self"])
    _grant(org, user_mgr, ["schedule:swap:approve:team"])

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
