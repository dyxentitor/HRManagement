import datetime as dt

import pytest

from modules.assignments.models import Assignment, AssignmentRecipient
from modules.assignments.services import engine
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


def _emp(org, dept, code, user=None, manager=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code}@x.com",
        department=dept,
        manager=manager,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x-eng",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    mu = User.objects.create_user(email="m@x.com", password="x", org_id=org.id)
    mgr = _emp(org, dept, "MGR", user=mu)
    r1 = _emp(org, dept, "R1", manager=mgr)
    r2 = _emp(org, dept, "R2", manager=mgr)
    other = _emp(org, dept, "OTH")
    return {"org": org, "mu": mu, "mgr": mgr, "r1": r1, "r2": r2, "other": other, "dept": dept}


@pytest.mark.django_db
def test_manager_report_ids(stack):
    ids = engine.manager_report_ids(stack["mu"].id, stack["org"].id)
    assert ids == {stack["r1"].id, stack["r2"].id}


@pytest.mark.django_db
def test_resolve_org_targets_returns_all(stack):
    ids = engine.resolve_targets(stack["org"].id, "org", [])
    assert len(ids) == 4  # mgr, r1, r2, other


@pytest.mark.django_db
def test_publish_fans_out_and_is_idempotent(stack):
    a = Assignment.objects.create(
        org_id=stack["org"].id,
        title="SOP",
        type="acknowledge",
        default_due_date=dt.date.today() + dt.timedelta(days=5),
    )
    n = engine.publish(
        a, target_employee_ids=[stack["r1"].id, stack["r2"].id], actor_id=stack["mu"].id
    )
    assert n == 2
    assert AssignmentRecipient.objects.filter(assignment=a).count() == 2
    assert a.recipients.first().due_date == a.default_due_date
    # re-publish same targets → no duplicates
    engine.publish(a, target_employee_ids=[stack["r1"].id, stack["r2"].id], actor_id=stack["mu"].id)
    assert AssignmentRecipient.objects.filter(assignment=a).count() == 2


@pytest.mark.django_db
def test_complete_sets_fields(stack):
    a = Assignment.objects.create(org_id=stack["org"].id, title="T", type="task")
    engine.publish(a, target_employee_ids=[stack["r1"].id], actor_id=stack["mu"].id)
    r = a.recipients.first()
    engine.complete(r, ip="1.2.3.4", note="done")
    r.refresh_from_db()
    assert r.status == "completed" and r.completed_at is not None
    assert r.completed_ip == "1.2.3.4" and r.note == "done"
