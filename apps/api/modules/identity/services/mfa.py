"""MFA (TOTP) services."""

from __future__ import annotations

import pyotp
from django.core.cache import cache
from django.utils import timezone

from modules.identity.models import MFADevice, User


def enable(user: User) -> dict:
    """Generate a new TOTP secret + provisioning URI. Replaces any unconfirmed device."""
    MFADevice.objects.filter(user=user, confirmed_at__isnull=True).delete()
    secret = pyotp.random_base32()
    MFADevice.objects.update_or_create(
        user=user,
        defaults={"secret": secret, "type": "totp", "confirmed_at": None},
    )
    issuer = "HRMS"
    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=issuer)
    return {"secret": secret, "provisioning_uri": provisioning_uri}


def confirm(user: User, code: str) -> bool:
    """Verify the first TOTP code. On success, mark device confirmed and user.mfa_enabled = True."""
    device = MFADevice.objects.filter(user=user).first()
    if not device:
        return False
    totp = pyotp.TOTP(device.secret)
    if not totp.verify(code, valid_window=1):
        return False
    device.confirmed_at = timezone.now()
    device.last_used_at = timezone.now()
    device.save(update_fields=["confirmed_at", "last_used_at"])
    user.mfa_enabled = True
    user.save(update_fields=["mfa_enabled", "updated_at"])
    return True


def disable(user: User) -> None:
    MFADevice.objects.filter(user=user).delete()
    user.mfa_enabled = False
    user.save(update_fields=["mfa_enabled", "updated_at"])


def verify_code_for_user(user: User, code: str) -> bool:
    """Verify a TOTP code against a user's confirmed MFA device.

    Returns True on success. Used by serializers / views that need to
    re-challenge for sensitive operations (bank change, role change).
    """
    device = MFADevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    if not device:
        return False
    if not pyotp.TOTP(device.secret).verify(code, valid_window=1):
        return False
    device.last_used_at = timezone.now()
    device.save(update_fields=["last_used_at"])
    return True


def verify_login_mfa(mfa_token: str, code: str) -> User | None:
    """Complete the second step of MFA-required login."""
    user_id = cache.get(f"mfa_challenge:{mfa_token}")
    if not user_id:
        return None
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None
    device = MFADevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    if not device:
        return None
    if not pyotp.TOTP(device.secret).verify(code, valid_window=1):
        return None
    cache.delete(f"mfa_challenge:{mfa_token}")
    device.last_used_at = timezone.now()
    device.save(update_fields=["last_used_at"])
    return user
