"""Emitter coverage: user.role_changed + onboarding.activated + bank-change in-app."""

import datetime
import os
import uuid
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from modules.identity.models import Role, User, UserRole
from modules.notification.models import Notification


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _user(org, email):
    return User.objects.create_user(
        email=email, password="x", org_id=org  # pragma: allowlist secret
    )


@pytest.mark.django_db
def test_role_change_notifies_target():
    org = uuid.uuid4()
    actor = _user(org, "actor@x.com")
    target = _user(org, "target@x.com")
    Role.objects.create(org_id=org, code="team_lead", name="TL", is_system=True)

    from modules.identity.services.permissions import assign_roles_to_user

    assign_roles_to_user(actor=actor, target=target, role_codes=["team_lead"])

    rows = Notification.objects.filter(type="user.role_changed", user=target)
    assert rows.exists()
    assert rows.first().priority == "high"


@pytest.mark.django_db
def test_onboarding_activation_notifies_hr():
    org = uuid.uuid4()
    new_user = _user(org, "new@x.com")
    hr = _user(org, "hr@x.com")
    role = Role.objects.create(org_id=org, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=hr, role=role, granted_by=None)

    from modules.identity.services.invitation import activate, create_invitation

    _inv, raw = create_invitation(new_user)
    activate(raw, password="BrandNew!2026", ip="")  # pragma: allowlist secret

    assert Notification.objects.filter(type="onboarding.activated", user=hr).exists()


@pytest.mark.django_db
def test_bank_change_notifies_hr_inapp():
    org = uuid.uuid4()
    hr = _user(org, "hr@x.com")
    role = Role.objects.create(org_id=org, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=hr, role=role, granted_by=None)

    from modules.employee.services import EmployeeService

    emp = SimpleNamespace(
        id=uuid.uuid4(),
        org_id=org,
        email="e@x.com",
        first_name="E",
        last_name="1",
        employee_code="E1",
        bank_name="B",
        bank_account_last4="1234",
        updated_at=datetime.datetime(2026, 7, 6, 12, 0, 0),
    )
    EmployeeService.notify_hr_of_bank_change(emp)

    assert Notification.objects.filter(
        type="employee.bank_changed_self", user=hr, channel="in_app"
    ).exists()
