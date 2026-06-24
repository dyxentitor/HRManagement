import datetime as dt

import pytest
from rest_framework.test import APIClient

from modules.assignments.models import Assignment
from modules.assignments.services import engine
from modules.assignments.tasks import spawn_recurring_assignments
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
        slug="x-rec",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    hr_u = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    _grant(role, "assignment:create:org", "assignment:read:org")
    UserRole.objects.create(user=hr_u, role=role)
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=None,
        employee_code="E1",
        first_name="E",
        last_name="x",
        email="e1@x.com",
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
    return {"org": org, "emp": emp, "hr": hr}


def test_advance_date_monthly_clamps():
    assert engine.advance_date(dt.date(2026, 1, 31), "monthly", 1) == dt.date(2026, 2, 28)
    assert engine.advance_date(dt.date(2026, 1, 15), "weekly", 2) == dt.date(2026, 1, 29)


@pytest.mark.django_db
def test_create_recurring_spawns_template_and_first_instance(stack):
    r = stack["hr"].post(
        "/api/v1/assignments/",
        {
            "title": "Weekly safety check",
            "type": "acknowledge",
            "recurrence": "weekly",
            "recurrence_interval": 1,
            "target": {"kind": "employee", "ids": [str(stack["emp"].id)]},
        },
        format="json",
    )
    assert r.status_code == 201, r.content
    template = Assignment.objects.get(id=r.json()["id"])
    assert template.is_template is True
    assert template.next_run_at == dt.date.today() + dt.timedelta(weeks=1)
    # first occurrence spawned now, with one recipient
    inst = Assignment.objects.get(parent=template)
    assert inst.is_template is False and inst.status == "published"
    assert inst.recipients.count() == 1


@pytest.mark.django_db
def test_beat_spawns_next_and_respects_until(stack):
    template = Assignment.objects.create(
        org_id=stack["org"].id,
        title="Daily",
        type="task",
        is_template=True,
        recurrence="daily",
        recurrence_interval=1,
        target_spec={"kind": "employee", "ids": [str(stack["emp"].id)]},
        next_run_at=dt.date.today(),
    )
    n = spawn_recurring_assignments()
    assert n == 1
    assert Assignment.objects.filter(parent=template).count() == 1
    template.refresh_from_db()
    assert template.next_run_at == dt.date.today() + dt.timedelta(days=1)

    # if recurrence_until is in the past, no more spawns
    template.recurrence_until = dt.date.today() - dt.timedelta(days=1)
    template.next_run_at = dt.date.today()
    template.save()
    assert spawn_recurring_assignments() == 0
