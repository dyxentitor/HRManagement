import uuid

import pytest
from django.core import mail

from common.mail.models import EmailConfiguration
from modules.identity.models import User
from modules.notification.models import Notification


@pytest.mark.django_db
def test_digest_skipped_when_notifications_disabled():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=False)
    user = User.objects.create_user(
        email="d@e.com",
        password="x",
        org_id=org_id,  # pragma: allowlist secret
    )
    Notification.objects.create(
        org_id=org_id,
        user=user,
        type="leave.approved",
        channel="email",
        delivery_status="pending",
        payload={},
    )
    from modules.notification.services.digest import send_digests

    send_digests()
    assert len(mail.outbox) == 0  # disabled -> no notification email


@pytest.mark.django_db
def test_password_reset_sends_even_when_disabled():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=False)
    User.objects.create_user(
        email="r@e.com",
        password="x",
        org_id=org_id,
        is_active=True,  # pragma: allowlist secret
    )
    from modules.identity.services.auth import initiate_password_reset

    initiate_password_reset("r@e.com")
    assert len(mail.outbox) == 1  # transactional bypasses the toggle
