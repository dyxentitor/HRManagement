"""Emitter coverage: announcement.published + schedule.roster_published fan-outs."""

import datetime
import os
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.mark.django_db
def test_announcement_publish_fans_out_to_active_users():
    org = uuid.uuid4()
    u1 = User.objects.create_user(
        email="a@x.com", password="x", org_id=org
    )  # pragma: allowlist secret
    u2 = User.objects.create_user(
        email="b@x.com", password="x", org_id=org
    )  # pragma: allowlist secret
    User.objects.create_user(
        email="c@x.com",
        password="x",
        org_id=org,
        is_active=False,  # pragma: allowlist secret
    )
    from modules.announcements.views import AnnouncementViewSet

    view = AnnouncementViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace(org_id=org, id=u1.id))
    serializer = MagicMock()
    serializer.save.return_value = SimpleNamespace(
        id=uuid.uuid4(), title="Holiday", category="general"
    )
    view.perform_create(serializer)

    rows = Notification.objects.filter(type="announcement.published")
    recipient_ids = set(rows.values_list("user_id", flat=True))
    assert recipient_ids == {u1.id, u2.id}  # inactive user excluded
    assert all(r.priority == "low" for r in rows)


def _make_employee(org_id, dept, user):
    return Employee.all_objects.create(
        org_id=org_id,
        employee_code="E1",
        first_name="E",
        last_name="1",
        email="e@x.com",
        phone="+1",
        date_of_birth=datetime.date(1985, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
        user=user,
    )


@pytest.mark.django_db
def test_roster_publish_notifies_affected_employees():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    user = User.objects.create_user(
        email="e@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp = _make_employee(org.id, dept, user)

    from modules.schedule.services.schedule import ScheduleService

    with patch("modules.schedule.services.schedule.ShiftAssignment") as sa:
        chain = sa.all_objects.filter.return_value
        chain.values_list.return_value.distinct.return_value = [emp.id]
        chain.update.return_value = 1
        ScheduleService.publish_for_period(
            org_id=org.id, date_from=datetime.date(2026, 6, 1), date_to=datetime.date(2026, 6, 7)
        )

    rows = Notification.objects.filter(
        type="schedule.roster_published", user=user, channel="in_app"
    )
    assert rows.count() == 1
    assert rows.first().priority == "low"
