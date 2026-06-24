import datetime as dt

import pytest
from django.core.management import call_command

from modules.assignments.models import Assignment, AssignmentResponse
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.mark.django_db
def test_seed_assignments_creates_spread_and_is_idempotent():
    org = Organization.objects.create(
        name="X",
        slug="x-seed",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    for i in range(3):
        Employee.all_objects.create(
            org_id=org.id,
            employee_code=f"E{i}",
            first_name=f"E{i}",
            last_name="x",
            email=f"e{i}@x.com",
            department=dept,
            employment_type="fulltime",
            hire_date=dt.date(2024, 1, 1),
        )

    call_command("seed_assignments", "--org-id", str(org.id))
    total = Assignment.objects.filter(org_id=org.id).count()
    assert total >= 7
    assert Assignment.objects.filter(org_id=org.id, type="questionnaire").exists()
    assert Assignment.objects.filter(org_id=org.id, is_template=True).exists()
    assert Assignment.objects.filter(org_id=org.id, requires_evidence=True).exists()
    assert AssignmentResponse.objects.filter(org_id=org.id).exists()

    # idempotent — no new assignments on re-run
    call_command("seed_assignments", "--org-id", str(org.id))
    assert Assignment.objects.filter(org_id=org.id).count() == total
