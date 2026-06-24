import datetime as dt

import pytest
from rest_framework.test import APIClient

from modules.assignments.models import Assignment, AssignmentQuestion, AssignmentResponse
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
        slug="x-q",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    hr_u = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    emp_u = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)
    hr_role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="emp", is_system=False)
    _grant(hr_role, "assignment:create:org", "assignment:read:org")
    UserRole.objects.create(user=hr_u, role=hr_role)
    UserRole.objects.create(user=emp_u, role=emp_role)
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
    empc = APIClient()
    empc.force_authenticate(emp_u)
    return {"org": org, "emp": emp, "hr": hr, "empc": empc}


def _create_questionnaire(hr, emp_id):
    return hr.post(
        "/api/v1/assignments/",
        {
            "title": "Onboarding survey",
            "type": "questionnaire",
            "target": {"kind": "employee", "ids": [str(emp_id)]},
            "questions": [
                {
                    "text": "Fav language?",
                    "qtype": "single_choice",
                    "options": ["Py", "TS"],
                    "required": True,
                },
                {"text": "Comments?", "qtype": "short_text", "options": [], "required": False},
            ],
        },
        format="json",
    )


@pytest.mark.django_db
def test_questionnaire_create_take_submit(stack):
    r = _create_questionnaire(stack["hr"], stack["emp"].id)
    assert r.status_code == 201, r.content
    a = Assignment.objects.get(title="Onboarding survey")
    assert AssignmentQuestion.objects.filter(assignment=a).count() == 2

    # employee fetches the questionnaire
    q = stack["empc"].get(f"/api/v1/assignments/{a.id}/questionnaire/")
    assert q.status_code == 200, q.content
    assert len(q.json()["questions"]) == 2
    q1 = next(x for x in q.json()["questions"] if x["text"] == "Fav language?")

    # submit
    s = stack["empc"].post(
        f"/api/v1/assignments/{a.id}/submit/",
        {"answers": {q1["id"]: "Py"}},
        format="json",
    )
    assert s.status_code == 200, s.content
    assert s.json()["status"] == "completed"
    assert AssignmentResponse.objects.filter(question_id=q1["id"]).count() == 1


@pytest.mark.django_db
def test_submit_requires_required_questions(stack):
    r = _create_questionnaire(stack["hr"], stack["emp"].id)
    a = Assignment.objects.get(id=r.json()["id"])
    # submit with no answers → 400 (the single_choice is required)
    s = stack["empc"].post(f"/api/v1/assignments/{a.id}/submit/", {"answers": {}}, format="json")
    assert s.status_code == 400


@pytest.mark.django_db
def test_responses_aggregate_for_hr(stack):
    r = _create_questionnaire(stack["hr"], stack["emp"].id)
    a = Assignment.objects.get(id=r.json()["id"])
    q1 = next(
        x
        for x in stack["empc"].get(f"/api/v1/assignments/{a.id}/questionnaire/").json()["questions"]
        if x["text"] == "Fav language?"
    )
    stack["empc"].post(
        f"/api/v1/assignments/{a.id}/submit/", {"answers": {q1["id"]: "Py"}}, format="json"
    )
    agg = stack["hr"].get(f"/api/v1/assignments/{a.id}/responses/")
    assert agg.status_code == 200, agg.content
    choice = next(x for x in agg.json() if x["text"] == "Fav language?")
    assert choice["counts"]["Py"] == 1
