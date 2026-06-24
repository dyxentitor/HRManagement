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


@pytest.mark.django_db
def test_analytics_totals_and_breakdowns():
    org = Organization.objects.create(
        name="X",
        slug="x-an",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    hr_u = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    _grant(role, "assignment:read:org")
    UserRole.objects.create(user=hr_u, role=role)
    e1 = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="E",
        last_name="1",
        email="e1@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    a = Assignment.objects.create(org_id=org.id, title="T", type="task", status="published")
    AssignmentRecipient.objects.create(
        org_id=org.id, assignment=a, employee_id=e1.id, status="completed"
    )
    AssignmentRecipient.objects.create(
        org_id=org.id,
        assignment=a,
        employee_id=Employee.all_objects.create(
            org_id=org.id,
            employee_code="E2",
            first_name="E",
            last_name="2",
            email="e2@x.com",
            department=dept,
            employment_type="fulltime",
            hire_date=dt.date(2024, 1, 1),
        ).id,
        due_date=dt.date.today() - dt.timedelta(days=1),  # overdue
    )

    c = APIClient()
    c.force_authenticate(hr_u)
    r = c.get("/api/v1/assignments/analytics/")
    assert r.status_code == 200, r.content
    data = r.json()
    assert data["totals"]["total"] == 2
    assert data["totals"]["completed"] == 1
    assert data["totals"]["overdue"] == 1
    assert data["totals"]["completion_rate"] == 50
    eng = next(d for d in data["by_department"] if d["department"] == "Eng")
    assert eng["total"] == 2 and eng["completed"] == 1 and eng["overdue"] == 1
    assert any(t["type"] == "task" and t["total"] == 2 for t in data["by_type"])
