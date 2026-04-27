"""Sessions service — refresh-token tracking + revocation."""

from __future__ import annotations

import hashlib
import uuid

from django.conf import settings
from django.utils import timezone

from modules.identity.models import Session, User


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    user: User,
    refresh_token: str,
    ip: str | None,
    user_agent: str,
) -> Session:
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    return Session.objects.create(
        user=user,
        refresh_token_hash=_hash_token(refresh_token),
        ip=ip,
        user_agent=(user_agent or "")[:512],
        expires_at=timezone.now() + lifetime,
    )


def revoke_session(session_id: uuid.UUID) -> None:
    Session.objects.filter(id=session_id, revoked_at__isnull=True).update(revoked_at=timezone.now())


def revoke_session_by_token(refresh_token: str) -> None:
    Session.objects.filter(
        refresh_token_hash=_hash_token(refresh_token),
        revoked_at__isnull=True,
    ).update(revoked_at=timezone.now())


def revoke_all_user_sessions(user: User) -> int:
    return Session.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def is_session_revoked(refresh_token: str) -> bool:
    sess = Session.objects.filter(refresh_token_hash=_hash_token(refresh_token)).first()
    return sess is None or sess.revoked_at is not None
