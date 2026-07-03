import uuid

import pytest

from common.mail.models import EmailConfiguration
from common.mail.serializers import EmailConfigurationSerializer, EmailConfigWriteSerializer


@pytest.mark.django_db
def test_read_serializer_hides_password_exposes_flag():
    cfg = EmailConfiguration.objects.create(
        org_id=uuid.uuid4(),
        smtp_host="h",
        smtp_password="pw",  # pragma: allowlist secret
    )
    data = EmailConfigurationSerializer(cfg).data
    assert "smtp_password" not in data
    assert data["has_password"] is True


@pytest.mark.django_db
def test_blank_password_preserves_stored_secret():
    cfg = EmailConfiguration.objects.create(
        org_id=uuid.uuid4(),
        smtp_host="h",
        smtp_password="orig",  # pragma: allowlist secret
    )
    ser = EmailConfigWriteSerializer(
        cfg, data={"smtp_username": "u", "smtp_password": ""}, partial=True
    )
    ser.is_valid(raise_exception=True)
    ser.save()
    cfg.refresh_from_db()
    assert cfg.smtp_password == "orig"  # pragma: allowlist secret
    assert cfg.smtp_username == "u"


@pytest.mark.django_db
def test_enabled_requires_host_and_sender():
    ser = EmailConfigWriteSerializer(data={"enabled": True}, partial=True)
    assert not ser.is_valid()
    assert "smtp_host" in ser.errors or "sender_email" in ser.errors
