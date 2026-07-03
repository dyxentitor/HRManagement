import uuid

import pytest

from common.mail.models import EmailConfiguration


@pytest.mark.django_db
def test_password_round_trips_through_encryption():
    org_id = uuid.uuid4()
    cfg = EmailConfiguration.objects.create(
        org_id=org_id,
        smtp_host="smtp.example.com",
        smtp_password="s3cret",  # pragma: allowlist secret
    )
    cfg.refresh_from_db()
    assert cfg.smtp_password == "s3cret"  # pragma: allowlist secret


@pytest.mark.django_db
def test_defaults_are_sensible():
    cfg = EmailConfiguration.objects.create(org_id=uuid.uuid4())
    assert cfg.smtp_port == 587
    assert cfg.encryption == "starttls"
    assert cfg.use_auth is True
    assert cfg.enabled is False
    assert cfg.connection_timeout == 10
