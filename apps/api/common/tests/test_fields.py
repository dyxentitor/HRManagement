"""Tests for common.fields.EncryptedCharField."""

import pytest
from django.db import models

from common.fields import EncryptedCharField


class _SecretBox(models.Model):
    secret = EncryptedCharField(max_length=256)  # pragma: allowlist secret

    class Meta:
        app_label = "common"

    def __str__(self) -> str:
        return f"_SecretBox({self.pk})"


@pytest.fixture(autouse=True)
def _set_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # 32-byte url-safe base64 key
    monkeypatch.setenv(
        "HRMS_FIELD_ENCRYPTION_KEY",
        "I1aD206iY5i0LqFsNDKqxcpxmE3fGHwjhM0BgBB8tOg=",  # pragma: allowlist secret
    )


@pytest.mark.django_db
def test_encrypted_charfield_roundtrip() -> None:
    row = _SecretBox.objects.create(secret="hello-world")  # pragma: allowlist secret
    row.refresh_from_db()
    assert row.secret == "hello-world"  # pragma: allowlist secret


@pytest.mark.django_db
def test_encrypted_charfield_stored_value_is_not_plaintext() -> None:
    from django.db import connection

    row = _SecretBox.objects.create(secret="my-bank-account")  # pragma: allowlist secret
    with connection.cursor() as cur:
        cur.execute("SELECT secret FROM common__secretbox WHERE id = %s", [str(row.id)])
        raw = cur.fetchone()[0]
    assert raw != "my-bank-account"
    # Fernet tokens are base64-url and start with "gAAAAA"
    if isinstance(raw, bytes):
        raw = raw.decode()
    assert raw.startswith("gAAAAA")


@pytest.mark.django_db
def test_encrypted_charfield_handles_none() -> None:
    box = _SecretBox(secret=None)  # pragma: allowlist secret
    box.save()
    box.refresh_from_db()
    assert box.secret is None  # pragma: allowlist secret
