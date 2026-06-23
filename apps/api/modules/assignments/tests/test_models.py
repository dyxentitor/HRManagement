import datetime as dt
import uuid

import pytest

from modules.assignments.models import Assignment, AssignmentRecipient


@pytest.mark.django_db
def test_effective_status_derives_overdue():
    org = uuid.uuid4()
    a = Assignment.objects.create(org_id=org, title="Read SOP", type="acknowledge")
    yesterday = dt.date.today() - dt.timedelta(days=1)
    r = AssignmentRecipient.objects.create(
        org_id=org, assignment=a, employee_id=uuid.uuid4(), due_date=yesterday
    )
    assert r.effective_status == "overdue"
    r.due_date = dt.date.today() + dt.timedelta(days=3)
    assert r.effective_status == "pending"
    r.status = "completed"
    assert r.effective_status == "completed"
