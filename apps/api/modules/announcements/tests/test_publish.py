import uuid
from unittest.mock import patch

import pytest

from modules.announcements.models import Announcement
from modules.announcements.services.publish import publish
from modules.identity.models import User
from modules.notification.models import Notification


@pytest.mark.django_db
def test_publish_fans_out_with_detail_deeplink():
    org = uuid.uuid4()
    u = User.objects.create_user(
        email="a@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    a = Announcement.objects.create(
        org_id=org, title="T", body="B", audience_type="all", priority="high"
    )
    publish(a)
    a.refresh_from_db()
    assert a.status == "published" and a.published_at is not None
    n = Notification.objects.filter(
        user=u, type="announcement.published", channel="in_app"
    ).first()
    assert n is not None
    assert n.deep_link == f"/announcements/{a.id}"
    assert n.priority == "high"


@pytest.mark.django_db
def test_publish_idempotent():
    a = Announcement.objects.create(
        org_id=uuid.uuid4(), title="T", body="B", status="published"
    )
    with patch("modules.announcements.services.publish.notify") as m:
        publish(a)
    m.assert_not_called()
