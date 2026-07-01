"""Field-encryption key rotation (MultiFernet) + the re-encrypt command + ledger task."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from django.core.management import call_command

from common.fields import _get_fernet


def test_multifernet_reads_old_key_after_rotation(monkeypatch):
    old = Fernet.generate_key().decode()
    new = Fernet.generate_key().decode()

    # Encrypt under the old key.
    monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", old)
    monkeypatch.delenv("HRMS_FIELD_ENCRYPTION_PREV_KEY", raising=False)
    token_old = _get_fernet().encrypt(b"1234567-89")

    # Rotate: new primary, old as prev — existing ciphertext still decrypts.
    monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", new)
    monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_PREV_KEY", old)
    assert _get_fernet().decrypt(token_old) == b"1234567-89"

    # New writes use the new primary — readable once the prev key is gone.
    token_new = _get_fernet().encrypt(b"1234567-89")
    monkeypatch.delenv("HRMS_FIELD_ENCRYPTION_PREV_KEY")
    assert _get_fernet().decrypt(token_new) == b"1234567-89"


@pytest.mark.django_db
def test_reencrypt_command_runs():
    # Empty DB: the command should discover encrypted fields and complete cleanly.
    call_command("reencrypt_sensitive_fields", "--dry-run")
    call_command("reencrypt_sensitive_fields")


@pytest.mark.django_db
def test_verify_payroll_ledger_task_ok_on_empty_chain():
    from common.audit.tasks import verify_payroll_ledger

    result = verify_payroll_ledger()
    assert result["ok"] is True
    assert result["broken_seq"] is None
