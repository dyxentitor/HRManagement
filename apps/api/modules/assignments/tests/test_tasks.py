import datetime as dt

import pytest

from modules.assignments.models import Assignment, AssignmentRecipient
from modules.assignments.tasks import assignment_reminders
from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


@pytest.mark.django_db
def test_reminder_notifies_recipient_due_tomorrow():
    org = Organization.objects.create(
        name="X",
        slug="x-task",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    u = User.objects.create_user(email="r@x.com", password="x", org_id=org.id)
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=u,
        employee_code="R",
        first_name="R",
        last_name="x",
        email="r@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    a = Assignment.objects.create(org_id=org.id, title="SOP", type="acknowledge")
    AssignmentRecipient.objects.create(
        org_id=org.id,
        assignment=a,
        employee_id=emp.id,
        due_date=dt.date.today() + dt.timedelta(days=1),
    )
    sent = assignment_reminders()
    assert sent == 1
    assert Notification.objects.filter(user=u, type="assignment.reminder").exists()
