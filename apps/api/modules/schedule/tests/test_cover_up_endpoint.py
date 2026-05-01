"""Endpoint tests for PATCH /api/v1/schedule/assignments/{id}/cover-up/."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Employee
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
    e1 = _make_employee(
        org,
        dept,
        employee_code="E1",
        first_name="A",
        email="a@a.com",
        phone="+60100000000",
        emergency_contact_phone="+60100000091",
    )
    e2 = _make_employee(
        org,
        dept,
        employee_code="E2",
        first_name="C",
        email="c@c.com",
        phone="+60100000001",
        emergency_contact_phone="+60100000092",
    )
    shift = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=dt.time(9, 0),
        end_time=dt.time(18, 0),
    )
    a = ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e1,
        shift=shift,
        work_date=dt.date(2026, 3, 4),
        assigned_by=user.id,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return org, e1, e2, a, client


def url(assignment_id):
    return f"/api/v1/schedule/shift-assignments/{assignment_id}/cover-up/"


def test_cover_up_set(setup):
    _, _, e2, a, client = setup
    resp = client.patch(url(a.id), {"covering_for_id": str(e2.id)}, format="json")
    assert resp.status_code == 200, resp.json()
    a.refresh_from_db()
    assert a.covering_for_id == e2.id
    assert resp.json()["covering_for_name"] == e2.full_name


def test_cover_up_clear(setup):
    _, _, e2, a, client = setup
    a.covering_for = e2
    a.save()
    resp = client.patch(url(a.id), {"covering_for_id": None}, format="json")
    assert resp.status_code == 200, resp.json()
    a.refresh_from_db()
    assert a.covering_for_id is None


def test_cover_up_self_reference_rejected(setup):
    _, e1, _, a, client = setup
    resp = client.patch(url(a.id), {"covering_for_id": str(e1.id)}, format="json")
    assert resp.status_code == 400


def test_cover_up_404_for_unknown_assignment(setup):
    _, _, e2, _, client = setup
    fake = uuid.uuid4()
    resp = client.patch(url(fake), {"covering_for_id": str(e2.id)}, format="json")
    assert resp.status_code == 404
