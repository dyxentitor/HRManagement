import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from modules.announcements.models import Announcement
from modules.announcements.tasks import publish_scheduled_announcements
from modules.identity.models import User
from modules.notification.models import Notification


@pytest.mark.django_db
def test_scheduled_due_gets_published_and_notifies():
    org = uuid.uuid4()
    u = User.objects.create_user(
        email="a@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    a = Announcement.objects.create(
        org_id=org,
        title="T",
        body="B",
        status="scheduled",
        scheduled_at=timezone.now() - timedelta(minutes=1),
        audience_type="all",
    )
    n = publish_scheduled_announcements()
    a.refresh_from_db()
    assert n == 1
    assert a.status == "published"
    assert Notification.objects.filter(user=u, type="announcement.published").exists()


@pytest.mark.django_db
def test_future_scheduled_not_published():
    a = Announcement.objects.create(
        org_id=uuid.uuid4(),
        title="T",
        body="B",
        status="scheduled",
        scheduled_at=timezone.now() + timedelta(days=1),
    )
    assert publish_scheduled_announcements() == 0
    a.refresh_from_db()
    assert a.status == "scheduled"
