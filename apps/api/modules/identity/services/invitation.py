"""Onboarding invitation tokens (single-use, expiring, audited).

The raw token is emailed and never stored — only its SHA-256 hash. Every
lifecycle event writes an AuditLog row, which is what the HR dashboard's
activity log renders. See References/Employee_creation.md §Secure Invitation.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from common.audit.service import append as audit_append

from ..models import Invitation, User
from .sessions import revoke_all_user_sessions


class InvalidInvitation(ValidationError):  # noqa: N818 — part of the service contract
    def __init__(self, detail: str = "This invitation link is invalid or has expired.") -> None:
        super().__init__({"token": detail})


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _expiry_hours(hours: int | None = None) -> int:
    return hours or getattr(settings, "INVITATION_EXPIRY_HOURS", 72)


def _org_name(org_id) -> str:
    from modules.organization.models import Organization

    org = Organization.objects.filter(id=org_id).first()
    return org.name if org else "Provintell"


def _audit(inv: Invitation, action: str, after: dict, actor_id=None) -> None:
    audit_append(
        org_id=inv.org_id,
        action=action,
        entity="invitation",
        entity_id=inv.id,
        after=after,
        actor_id=actor_id,
    )


def build_activation_link(raw_token: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/activate?token={raw_token}"


def send_invitation_email(
    user: User, raw_token: str, expires_at, to_email: str | None = None
) -> None:
    link = build_activation_link(raw_token)
    org = _org_name(user.org_id)
    hours = _expiry_hours()
    from common.mail import send as mail_send
    from common.mail.render import render_email

    subject, text, html = render_email(
        "invite", {"org": org, "link": link, "hours": hours}, org_id=user.org_id
    )
    mail_send(
        org_id=user.org_id,
        subject=subject,
        body=text,
        to=[to_email or user.email],
        html_body=html,
        category="transactional",
        append_signature=True,
        fail_silently=False,
    )


def create_invitation(
    user: User,
    *,
    created_by=None,
    employee_id=None,
    sent_to: str | None = None,
    hours: int | None = None,
) -> tuple[Invitation, str]:
    raw = secrets.token_urlsafe(32)
    now = timezone.now()
    # deliver to the personal/invite email when given, else the company login.
    to_email = sent_to or user.email
    inv = Invitation.objects.create(
        org_id=user.org_id,
        user=user,
        employee_id=employee_id,
        sent_to_email=to_email,
        token_hash=_hash(raw),
        status="sent",
        expires_at=now + timedelta(hours=_expiry_hours(hours)),
        created_by=created_by,
        sent_at=now,
    )
    _audit(inv, "invitation.created", {"email": user.email}, created_by)
    _audit(
        inv,
        "invitation.sent",
        {"to": to_email, "expires_at": inv.expires_at.isoformat()},
        created_by,
    )
    send_invitation_email(user, raw, inv.expires_at, to_email)
    return inv, raw


def _find_live(raw_token: str) -> Invitation:
    inv = Invitation.objects.filter(token_hash=_hash(raw_token)).select_related("user").first()
    if inv is None or inv.status in ("revoked", "activated") or inv.is_expired:
        raise InvalidInvitation()
    return inv


def verify(raw_token: str, *, ip: str = "", ua: str = "") -> Invitation:
    inv = _find_live(raw_token)
    if inv.status == "sent":
        inv.status = "opened"
        inv.opened_at = timezone.now()
        inv.opened_ip = (ip or "")[:64]
        inv.opened_user_agent = (ua or "")[:1000]
        inv.save(update_fields=["status", "opened_at", "opened_ip", "opened_user_agent"])
        _audit(inv, "invitation.opened", {"ip": ip})
    return inv


def activate(raw_token: str, *, password: str, ip: str = "") -> User:
    inv = _find_live(raw_token)
    user = inv.user
    user.set_password(password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_all_user_sessions(user)
    inv.status = "activated"
    inv.activated_at = timezone.now()
    inv.activated_ip = (ip or "")[:64]
    inv.save(update_fields=["status", "activated_at", "activated_ip"])
    _audit(inv, "invitation.activated", {"ip": ip})

    # Notify HR managers that a new account was activated (best-effort).
    try:
        from modules.notification.services.notify import notify
        from modules.notification.services.recipients import hr_manager_users

        for hr in hr_manager_users(user.org_id):
            notify(
                user=hr,
                type="onboarding.activated",
                payload={"email": user.email, "user_id": str(user.id)},
                deep_link="/admin/settings/users",
                priority="normal",
            )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Failed to send onboarding.activated notification")

    return user


def resend(inv: Invitation, *, by=None) -> str:
    raw = secrets.token_urlsafe(32)
    now = timezone.now()
    inv.token_hash = _hash(raw)
    inv.expires_at = now + timedelta(hours=_expiry_hours())
    inv.sent_count += 1
    inv.status = "sent"
    inv.sent_at = now
    inv.opened_at = None
    inv.save(
        update_fields=["token_hash", "expires_at", "sent_count", "status", "sent_at", "opened_at"]
    )
    _audit(inv, "invitation.resent", {"sent_count": inv.sent_count}, by)
    send_invitation_email(inv.user, raw, inv.expires_at, inv.sent_to_email or None)
    return raw


def regenerate_link(inv: Invitation, *, by=None) -> str:
    """Mint a fresh activation link for HR to copy.

    Because only the token hash is stored, the original link can't be recovered —
    so 'copy link' rotates the token (the old link dies) and returns the new one.
    No email is sent. Activated/revoked invitations are not re-opened.
    """
    if inv.status in ("activated", "revoked"):
        raise InvalidInvitation("This invitation can no longer be shared.")
    raw = secrets.token_urlsafe(32)
    now = timezone.now()
    inv.token_hash = _hash(raw)
    inv.expires_at = now + timedelta(hours=_expiry_hours())
    inv.status = "sent"
    inv.sent_at = now
    inv.opened_at = None
    inv.save(update_fields=["token_hash", "expires_at", "status", "sent_at", "opened_at"])
    _audit(inv, "invitation.link_copied", {}, by)
    return raw


def revoke(inv: Invitation, *, by=None) -> None:
    inv.status = "revoked"
    inv.revoked_at = timezone.now()
    inv.save(update_fields=["status", "revoked_at"])
    _audit(inv, "invitation.revoked", {}, by)


def extend(inv: Invitation, *, hours: int = 48, by=None) -> None:
    base = max(inv.expires_at, timezone.now())
    inv.expires_at = base + timedelta(hours=hours)
    if inv.status not in ("activated", "revoked"):
        inv.status = "sent" if inv.opened_at is None else "opened"
    inv.save(update_fields=["expires_at", "status"])
    _audit(
        inv,
        "invitation.extended",
        {"hours": hours, "expires_at": inv.expires_at.isoformat()},
        by,
    )
