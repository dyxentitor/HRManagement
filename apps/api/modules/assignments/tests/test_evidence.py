import datetime as dt

import pytest
from rest_framework.test import APIClient

from modules.assignments.models import Assignment, AssignmentRecipient
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x-ev",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    hr_u = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    emp_u = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    _grant(role, "assignment:create:org", "assignment:read:org")
    UserRole.objects.create(user=hr_u, role=role)
    UserRole.objects.create(
        user=emp_u, role=Role.objects.create(org_id=org.id, code="e", name="e", is_system=False)
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=emp_u,
        employee_code="E1",
        first_name="E",
        last_name="x",
        email="emp@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    Employee.all_objects.create(
        org_id=org.id,
        user=hr_u,
        employee_code="HR",
        first_name="H",
        last_name="r",
        email="hr@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    hr = APIClient()
    hr.force_authenticate(hr_u)
    ec = APIClient()
    ec.force_authenticate(emp_u)
    return {"org": org, "emp": emp, "hr": hr, "ec": ec}


@pytest.mark.django_db
def test_evidence_required_blocks_then_completes(stack):
    r = stack["hr"].post(
        "/api/v1/assignments/",
        {
            "title": "Upload signed form",
            "type": "task",
            "requires_evidence": True,
            "target": {"kind": "employee", "ids": [str(stack["emp"].id)]},
        },
        format="json",
    )
    a = Assignment.objects.get(id=r.json()["id"])
    # complete without evidence → 400
    no_ev = stack["ec"].post(f"/api/v1/assignments/{a.id}/complete/", {}, format="json")
    assert no_ev.status_code == 400
    # with evidence key → 200
    ok = stack["ec"].post(
        f"/api/v1/assignments/{a.id}/complete/",
        {"evidence_s3_key": "assignments/x/y/z"},
        format="json",
    )
    assert ok.status_code == 200, ok.content
    rec = AssignmentRecipient.objects.get(assignment=a, employee_id=stack["emp"].id)
    assert rec.status == "completed" and rec.evidence_s3_key == "assignments/x/y/z"


@pytest.mark.django_db
def test_revise_reopens_completed_recipients(stack):
    r = stack["hr"].post(
        "/api/v1/assignments/",
        {
            "title": "Policy",
            "type": "acknowledge",
            "target": {"kind": "employee", "ids": [str(stack["emp"].id)]},
        },
        format="json",
    )
    a = Assignment.objects.get(id=r.json()["id"])
    stack["ec"].post(f"/api/v1/assignments/{a.id}/complete/", {}, format="json")
    rec = AssignmentRecipient.objects.get(assignment=a)
    assert rec.status == "completed" and rec.acked_version == 1

    rev = stack["hr"].post(f"/api/v1/assignments/{a.id}/revise/")
    assert rev.status_code == 200, rev.content
    assert rev.json()["version"] == 2 and rev.json()["reopened"] == 1
    rec.refresh_from_db()
    assert rec.status == "pending" and rec.completed_at is None
