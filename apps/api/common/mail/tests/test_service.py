import uuid
from unittest.mock import patch

import pytest
from django.core import mail

from common.mail import service
from common.mail.models import EmailConfiguration


@pytest.mark.django_db
def test_encryption_maps_to_tls_ssl():
    cfg = EmailConfiguration(org_id=uuid.uuid4(), smtp_host="h", encryption="starttls")
    conn = service.build_connection(cfg)
    assert conn.use_tls is True and conn.use_ssl is False
    cfg.encryption = "ssl"
    conn = service.build_connection(cfg)
    assert conn.use_ssl is True and conn.use_tls is False


@pytest.mark.django_db
def test_notification_skipped_when_disabled():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="h", enabled=False)
    sent = service.send(
        org_id=org_id, subject="s", body="b", to=["x@e.com"], category="notification"
    )
    assert sent is False
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_transactional_sends_even_when_disabled():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=False)
    sent = service.send(
        org_id=org_id, subject="s", body="b", to=["x@e.com"], category="transactional"
    )
    assert sent is True
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_signature_appended_when_requested():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(
        org_id=org_id, smtp_host="", enabled=True, signature="Best,\nHR"
    )
    service.send(
        org_id=org_id,
        subject="s",
        body="Hello",
        to=["x@e.com"],
        category="notification",
        append_signature=True,
    )
    assert "Best,\nHR" in mail.outbox[0].body


@pytest.mark.django_db
def test_run_connection_test_records_success():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(
        org_id=org_id,
        smtp_host="h",
        smtp_username="u",
        smtp_password="pw",  # pragma: allowlist secret
    )
    with patch("common.mail.service.build_connection") as bc:
        bc.return_value.open.return_value = True
        bc.return_value.close.return_value = None
        result = service.run_connection_test(org_id, {"smtp_host": "h2"})
    assert result["success"] is True
    cfg = EmailConfiguration.objects.get(org_id=org_id)
    assert cfg.last_success_at is not None


@pytest.mark.django_db
def test_run_connection_test_records_failure():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="h")
    with patch("common.mail.service.build_connection") as bc:
        bc.return_value.open.side_effect = OSError("connection refused")
        result = service.run_connection_test(org_id, {})
    assert result["success"] is False
    assert "connection refused" in result["detail"]
    cfg = EmailConfiguration.objects.get(org_id=org_id)
    assert cfg.last_failure_at is not None
    assert "connection refused" in cfg.last_failure_message


@pytest.mark.django_db
def test_send_attaches_cc_recipients():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=True)
    service.send(
        org_id=org_id,
        subject="Subject",
        body="Body",
        to=["emp@provintell.com"],
        cc=["hr@provintell.com", "boss@provintell.com"],
    )
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["emp@provintell.com"]
    assert mail.outbox[0].cc == ["hr@provintell.com", "boss@provintell.com"]


@pytest.mark.django_db
def test_send_without_cc_leaves_cc_empty():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=True)
    service.send(org_id=org_id, subject="Subject", body="Body", to=["emp@provintell.com"])
    assert mail.outbox[0].cc == []


@pytest.mark.django_db
def test_send_with_empty_cc_list_leaves_cc_empty():
    org_id = uuid.uuid4()
    EmailConfiguration.objects.create(org_id=org_id, smtp_host="", enabled=True)
    service.send(org_id=org_id, subject="Subject", body="Body", to=["emp@provintell.com"], cc=[])
    assert mail.outbox[0].cc == []
