"""v1.11.0 — provision_user shared user-provisioning service."""

import pytest
from django.core import mail
from django.core.management import call_command

from modules.identity.models import UserRole
from modules.identity.services.provisioning import UserAlreadyExists, provision_user
from modules.organization.models import Organization


@pytest.fixture
def org(db):
    call_command("seed_permission_catalogue")
    o = Organization.objects.create(
        name="T",
        slug="t",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    call_command("seed_default_roles", "--org-id", str(o.id))
    return o


def test_invite_creates_unusable_password_user_and_sends_one_email(org):
    mail.outbox.clear()
    user = provision_user(
        org_id=org.id,
        email="invitee@example.com",
        role_code="employee",
        credential_method="invite",
    )

    user.refresh_from_db()
    assert user.org_id == org.id
    assert user.email == "invitee@example.com"
    assert user.has_usable_password() is False
    assert UserRole.objects.filter(user=user, role__code="employee").exists()
    assert len(mail.outbox) == 1
    assert "invitee@example.com" in mail.outbox[0].to


def test_temp_sets_checkable_password_and_must_change_flag_no_email(org):
    mail.outbox.clear()
    user = provision_user(
        org_id=org.id,
        email="temp@example.com",
        role_code="employee",
        credential_method="temp",
        temp_password="S3cret-temp-pw",
    )

    user.refresh_from_db()
    assert user.has_usable_password() is True
    assert user.check_password("S3cret-temp-pw") is True
    assert user.must_change_password is True
    assert UserRole.objects.filter(user=user, role__code="employee").exists()
    assert len(mail.outbox) == 0


def test_temp_without_password_raises(org):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        provision_user(
            org_id=org.id,
            email="nopw@example.com",
            role_code="employee",
            credential_method="temp",
        )


def test_duplicate_email_raises_case_insensitive(org):
    provision_user(
        org_id=org.id,
        email="dupe@example.com",
        role_code="employee",
        credential_method="invite",
    )
    with pytest.raises(UserAlreadyExists):
        provision_user(
            org_id=org.id,
            email="DUPE@example.com",
            role_code="employee",
            credential_method="invite",
        )


def test_unknown_role_raises(org):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError) as exc:
        provision_user(
            org_id=org.id,
            email="badrole@example.com",
            role_code="not_a_real_role",
            credential_method="invite",
        )
    assert not isinstance(exc.value, UserAlreadyExists)


def test_invalid_credential_method_raises(org):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        provision_user(
            org_id=org.id,
            email="badmethod@example.com",
            role_code="employee",
            credential_method="carrier-pigeon",
        )


def test_writes_audit_row(org):
    from common.audit.models import AuditLog

    user = provision_user(
        org_id=org.id,
        email="audited@example.com",
        role_code="employee",
        credential_method="invite",
    )
    assert AuditLog.objects.filter(
        org_id=org.id, action="user.created", entity="user", entity_id=user.id
    ).exists()
