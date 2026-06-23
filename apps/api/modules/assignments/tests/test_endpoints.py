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


def _emp(org, dept, code, user=None, manager=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code.lower()}@x.com",
        department=dept,
        manager=manager,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x-ep",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    users = {
        k: User.objects.create_user(email=f"{k}@x.com", password="x", org_id=org.id)
        for k in ("hr", "mgr", "r1", "r2", "other")
    }
    roles = {
        "hr": ("hr", ["assignment:create:org", "assignment:read:org"]),
        "mgr": ("manager2", ["assignment:create:team"]),
        "r1": ("employee", []),
        "r2": ("employee2", []),
        "other": ("employee3", []),
    }
    for k, (code, perms) in roles.items():
        r = Role.objects.create(org_id=org.id, code=code, name=code, is_system=False)
        _grant(r, *perms)
        UserRole.objects.create(user=users[k], role=r)
    mgr = _emp(org, dept, "MGR", user=users["mgr"])
    r1 = _emp(org, dept, "R1", user=users["r1"], manager=mgr)
    r2 = _emp(org, dept, "R2", user=users["r2"], manager=mgr)
    other = _emp(org, dept, "OTH", user=users["other"])
    _emp(org, dept, "HR", user=users["hr"])
    return {
        "org": org,
        "emp": {"mgr": mgr, "r1": r1, "r2": r2, "other": other},
        "c": {k: _client(u) for k, u in users.items()},
    }


def test_employee_cannot_create(stack):
    r = stack["c"]["r1"].post(
        "/api/v1/assignments/",
        {"title": "X", "type": "task", "target": {"kind": "org", "ids": []}},
        format="json",
    )
    assert r.status_code == 403


def test_hr_creates_org_wide(stack):
    r = stack["c"]["hr"].post(
        "/api/v1/assignments/",
        {"title": "Read SOP", "type": "acknowledge", "target": {"kind": "org", "ids": []}},
        format="json",
    )
    assert r.status_code == 201, r.content
    a = Assignment.objects.get(title="Read SOP")
    assert a.status == "published"
    assert AssignmentRecipient.objects.filter(assignment=a).count() == 5  # all employees


def test_manager_targets_excludes_non_reports(stack):
    e = stack["emp"]
    r = stack["c"]["mgr"].post(
        "/api/v1/assignments/",
        {
            "title": "Team task",
            "type": "task",
            "target": {"kind": "employee", "ids": [str(e["r1"].id), str(e["other"].id)]},
        },
        format="json",
    )
    assert r.status_code == 201, r.content
    a = Assignment.objects.get(title="Team task")
    emp_ids = set(
        AssignmentRecipient.objects.filter(assignment=a).values_list("employee_id", flat=True)
    )
    assert e["r1"].id in emp_ids
    assert e["other"].id not in emp_ids  # not a direct report → excluded


def test_me_feed_and_complete_owner_only(stack):
    e = stack["emp"]
    stack["c"]["hr"].post(
        "/api/v1/assignments/",
        {"title": "Ack", "type": "acknowledge", "target": {"kind": "org", "ids": []}},
        format="json",
    )
    a = Assignment.objects.get(title="Ack")
    # r1 sees it in their feed
    feed = stack["c"]["r1"].get("/api/v1/assignments/me/").json()
    assert any(row["assignment"]["title"] == "Ack" for row in feed)
    # r1 completes their own row
    ok = stack["c"]["r1"].post(
        f"/api/v1/assignments/{a.id}/complete/", {"note": "read"}, format="json"
    )
    assert ok.status_code == 200, ok.content
    r = AssignmentRecipient.objects.get(assignment=a, employee_id=e["r1"].id)
    assert r.status == "completed"


def test_complete_404_when_not_a_recipient(stack):
    # create targeting only r1; r2 has no row for it
    e = stack["emp"]
    stack["c"]["hr"].post(
        "/api/v1/assignments/",
        {
            "title": "Only R1",
            "type": "task",
            "target": {"kind": "employee", "ids": [str(e["r1"].id)]},
        },
        format="json",
    )
    a = Assignment.objects.get(title="Only R1")
    assert stack["c"]["r2"].post(f"/api/v1/assignments/{a.id}/complete/").status_code == 404
