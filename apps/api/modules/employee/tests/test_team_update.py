"""Regression: changing an employee's team via the HR edit PATCH must persist.

Root cause (pre-fix): `team` was absent from EmployeeSerializer.Meta.fields, so DRF
silently dropped `{"team": ...}` on write and never returned it on read.
"""

import datetime as dt

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee, Team
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X", slug="tu", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    t1 = Team.objects.create(org_id=org.id, name="Alpha")
    t2 = Team.objects.create(org_id=org.id, name="Bravo")
    hr_u = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    _grant(role, "employee:write:org", "employee:read:org")
    UserRole.objects.create(user=hr_u, role=role)
    emp = Employee.all_objects.create(
        org_id=org.id, employee_code="E1", first_name="A", last_name="b", email="e1@x.com",
        department=dept, team=t1, employment_type="fulltime", hire_date=dt.date(2024, 1, 1),
    )
    c = APIClient()
    c.force_authenticate(hr_u)
    return {"org": org, "dept": dept, "t1": t1, "t2": t2, "emp": emp, "c": c}


def test_detail_read_exposes_team_and_department(stack):
    body = stack["c"].get(f"/api/v1/employees/{stack['emp'].id}/").json()
    assert str(body["team"]) == str(stack["t1"].id)
    assert str(body["department_id"]) == str(stack["dept"].id)
    assert body["department_name"] == "Eng"
    assert body["team_name"] == "Alpha"


def test_patch_changes_team_and_persists(stack):
    r = stack["c"].patch(
        f"/api/v1/employees/{stack['emp'].id}/", {"team": str(stack["t2"].id)}, format="json"
    )
    assert r.status_code == 200, r.content
    stack["emp"].refresh_from_db()
    assert stack["emp"].team_id == stack["t2"].id
    # and the change round-trips on the next read (no stale data)
    body = stack["c"].get(f"/api/v1/employees/{stack['emp'].id}/").json()
    assert str(body["team"]) == str(stack["t2"].id)
    assert body["team_name"] == "Bravo"


def test_patch_can_clear_team(stack):
    r = stack["c"].patch(
        f"/api/v1/employees/{stack['emp'].id}/", {"team": None}, format="json"
    )
    assert r.status_code == 200, r.content
    stack["emp"].refresh_from_db()
    assert stack["emp"].team_id is None
