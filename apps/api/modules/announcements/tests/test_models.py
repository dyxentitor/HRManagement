import uuid

import pytest

from modules.announcements.models import Announcement, AnnouncementRead


@pytest.mark.django_db
def test_defaults():
    a = Announcement.objects.create(org_id=uuid.uuid4(), title="T", body="B")
    assert a.status == "draft"
    assert a.priority == "normal"
    assert a.audience_type == "all"
    assert a.audience_spec == []
    assert a.published_at is None


@pytest.mark.django_db
def test_read_unique():
    org = uuid.uuid4()
    a = Announcement.objects.create(org_id=org, title="T", body="B")
    uid = uuid.uuid4()
    AnnouncementRead.objects.create(org_id=org, announcement=a, user_id=uid)
    with pytest.raises(Exception):
        AnnouncementRead.objects.create(org_id=org, announcement=a, user_id=uid)
