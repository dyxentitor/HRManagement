"""Endpoint tests for POST /api/v1/schedule/assignments/bulk-fill/."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Employee, Team
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift, ShiftAssignment

pytestmark = pytest.mark.django_db


def _make_employee(org, dept, **overrides):
    defaults = dict(
        org_id=org.id,
        employee_code="E1",
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


@pytest.fixture
def setup(db):
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
    user = User.objects.create_user(email="a@a.com", password="p!", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="org_admin", name="A", is_system=True)
    p, _ = Permission.objects.get_or_create(code="schedule:assignment:write:team")
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role)
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    team = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)
    emp = _make_employee(org, dept, team=team)
    shift = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=dt.time(9, 0),
        end_time=dt.time(18, 0),
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return org, user, emp, shift, client


URL = "/api/v1/schedule/shift-assignments/bulk-fill/"


def test_bulk_fill_creates_assignments(setup):
    org, _, emp, shift, client = setup
    body = {
        "cells": [{"employee_id": str(emp.id), "work_date": "2026-03-04"}],
        "shift_id": str(shift.id),
        "notes": "",
    }
    resp = client.post(URL, body, format="json")
    assert resp.status_code == 200, resp.json()
    body_resp = resp.json()
    assert body_resp["created"] == 1
    assert body_resp["updated"] == 0
    assert ShiftAssignment.all_objects.filter(employee=emp).count() == 1


def test_bulk_fill_updates_existing(setup):
    org, _, emp, shift, client = setup
    other = Shift.all_objects.create(
        org_id=org.id,
        name="Night",
        code="N",
        start_time=dt.time(21, 0),
        end_time=dt.time(8, 0),
        crosses_midnight=True,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=emp,
        shift=other,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    body = {
        "cells": [{"employee_id": str(emp.id), "work_date": "2026-03-04"}],
        "shift_id": str(shift.id),
        "notes": "",
    }
    resp = client.post(URL, body, format="json")
    assert resp.status_code == 200, resp.json()
    body_resp = resp.json()
    assert body_resp["created"] == 0
    assert body_resp["updated"] == 1
    a = ShiftAssignment.all_objects.get(employee=emp, work_date=dt.date(2026, 3, 4))
    assert a.shift_id == shift.id


def test_bulk_fill_returns_warnings_does_not_block(setup):
    """min_headcount=2 + only one cell ⇒ warning fires but save succeeds."""
    org, _, emp, shift, client = setup
    Team.all_objects.filter(org_id=org.id).update(min_headcount=2)
    body = {
        "cells": [{"employee_id": str(emp.id), "work_date": "2026-03-04"}],
        "shift_id": str(shift.id),
        "notes": "",
    }
    resp = client.post(URL, body, format="json")
    assert resp.status_code == 200, resp.json()
    body_resp = resp.json()
    assert body_resp["created"] == 1
    assert any(w["rule"] == "coverage_drop" for w in body_resp["warnings"])


def test_bulk_fill_requires_write_perm(setup):
    org, user, emp, shift, client = setup
    UserRole.objects.filter(user=user).delete()
    body = {
        "cells": [{"employee_id": str(emp.id), "work_date": "2026-03-04"}],
        "shift_id": str(shift.id),
        "notes": "",
    }
    resp = client.post(URL, body, format="json")
    assert resp.status_code == 403


def test_bulk_fill_validates_empty_cells(setup):
    org, _, _, shift, client = setup
    body = {"cells": [], "shift_id": str(shift.id), "notes": ""}
    resp = client.post(URL, body, format="json")
    assert resp.status_code == 400
