"""Field-level envelope encryption using cryptography.Fernet."""

from __future__ import annotations

import os
from typing import Any

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.core.exceptions import ImproperlyConfigured
from django.db import models


def _fernet_from(raw: str, name: str) -> Fernet:
    try:
        return Fernet(raw)
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured(f"{name} must be a 32-byte url-safe base64 Fernet key") from exc


def _get_fernet() -> MultiFernet:
    """Build a MultiFernet: encrypts with the primary key, decrypts with primary
    OR the optional previous key. During a key rotation, set
    ``HRMS_FIELD_ENCRYPTION_PREV_KEY`` to the old key so existing ciphertext still
    reads while new writes use the new primary; run ``reencrypt_sensitive_fields``
    to migrate all rows, then drop the prev key. With no prev key this behaves
    identically to a single-key Fernet."""
    raw = os.environ.get("HRMS_FIELD_ENCRYPTION_KEY")
    if not raw:
        raise ImproperlyConfigured("HRMS_FIELD_ENCRYPTION_KEY is required")
    keys = [_fernet_from(raw, "HRMS_FIELD_ENCRYPTION_KEY")]
    prev = os.environ.get("HRMS_FIELD_ENCRYPTION_PREV_KEY")
    if prev:
        keys.append(_fernet_from(prev, "HRMS_FIELD_ENCRYPTION_PREV_KEY"))
    return MultiFernet(keys)


class EncryptedCharField(models.BinaryField):
    """Stores plaintext as a Fernet token in a BinaryField column.

    Use for free-text PII (IC, bank account, tax IDs). For numeric values
    where range queries matter, hash + last-N-chars patterns are preferable.
    """

    description = "Envelope-encrypted text (Fernet)"

    def __init__(self, *args: Any, max_length: int | None = None, **kwargs: Any) -> None:
        # max_length is a model-side hint for serializers / forms; not applied at DB level.
        self._max_length = max_length
        kwargs.setdefault("editable", True)
        super().__init__(*args, **kwargs)

    def from_db_value(self, value: Any, expression: Any, connection: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, memoryview):
            value = bytes(value)
        try:
            return _get_fernet().decrypt(value).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Encrypted column contains invalid Fernet token") from exc

    def to_python(self, value: Any) -> str | None:
        if value is None or isinstance(value, str):
            return value
        if isinstance(value, bytes | memoryview):
            return self.from_db_value(value, None, None)
        return str(value)

    def get_prep_value(self, value: Any) -> bytes | None:
        if value is None:
            return None
        if isinstance(value, bytes):
            return value
        if self._max_length is not None and len(value) > self._max_length:
            raise ValueError(f"value exceeds max_length={self._max_length} ({len(value)} chars)")
        return _get_fernet().encrypt(value.encode("utf-8"))

    def value_to_string(self, obj: Any) -> str:
        # Used by serialization. We refuse to leak ciphertext; serialize as None.
        return ""
