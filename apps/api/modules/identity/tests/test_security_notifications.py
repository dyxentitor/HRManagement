import os
import uuid

import pyotp
import pytest
from cryptography.fernet import Fernet

from modules.identity.models import MFADevice, User
from modules.identity.services import auth as auth_svc
from modules.identity.services import mfa as mfa_svc
from modules.notification.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        # pragma: allowlist secret
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture
def user():
    # pragma: allowlist secret
    return User.objects.create_user(email="sec@x.com", password="old-pass1", org_id=uuid.uuid4())


def _count(user, type_):
    return Notification.objects.filter(user=user, type=type_, channel="in_app").count()


def test_change_own_password_fires_alert(user):
    auth_svc.change_own_password(user=user, new_password="new-pass-123")  # pragma: allowlist secret
    assert _count(user, "auth.password_changed") == 1


def test_complete_password_reset_fires_alert(user):
    from django.core.cache import cache

    token = "tok-123"
    cache.set(f"pwreset:{token}", str(user.id), timeout=300)
    auth_svc.complete_password_reset(token, "new-pass-456")  # pragma: allowlist secret
    assert _count(user, "auth.password_changed") == 1


def test_mfa_confirm_and_disable_fire_alerts(user):
    mfa_svc.enable(user)  # generates secret; must NOT fire
    assert _count(user, "auth.mfa_enabled") == 0
    dev = MFADevice.objects.get(user=user)
    code = pyotp.TOTP(dev.secret).now()
    assert mfa_svc.confirm(user, code) is True
    assert _count(user, "auth.mfa_enabled") == 1
    mfa_svc.disable(user)
    assert _count(user, "auth.mfa_disabled") == 1
