"""Tests for the custom User model + UserManager."""

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

User = get_user_model()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.django_db
def test_create_user_hashes_password_with_argon2(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(
        email="alice@example.com",
        password="s3cret-p@ss!",  # pragma: allowlist secret
        org_id=org_id,
    )
    assert u.email == "alice@example.com"
    assert u.password.startswith("argon2")
    assert u.check_password("s3cret-p@ss!")  # pragma: allowlist secret


@pytest.mark.django_db
def test_create_user_normalizes_email(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="ALICE@Example.COM", password="x", org_id=org_id)
    assert u.email == "ALICE@example.com"  # domain lowercased; local part preserved


@pytest.mark.django_db
def test_create_user_email_is_required(org_id: uuid.UUID) -> None:
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x", org_id=org_id)


@pytest.mark.django_db
def test_create_user_org_id_is_required() -> None:
    with pytest.raises(ValueError):
        User.objects.create_user(email="bob@example.com", password="x", org_id=None)


@pytest.mark.django_db
def test_email_unique_within_org(org_id: uuid.UUID) -> None:
    User.objects.create_user(email="charlie@example.com", password="x", org_id=org_id)
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="charlie@example.com", password="y", org_id=org_id)


@pytest.mark.django_db
def test_same_email_allowed_in_different_orgs() -> None:
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    User.objects.create_user(email="dana@example.com", password="x", org_id=org_a)
    User.objects.create_user(email="dana@example.com", password="y", org_id=org_b)
    assert User.objects.filter(email="dana@example.com").count() == 2


@pytest.mark.django_db
def test_create_superuser_sets_flags(org_id: uuid.UUID) -> None:
    u = User.objects.create_superuser(email="admin@example.com", password="x", org_id=org_id)
    assert u.is_staff is True
    assert u.is_superuser is True


@pytest.mark.django_db
def test_user_has_default_preferences_and_consents(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="e@example.com", password="x", org_id=org_id)
    assert u.preferences == {"theme": "system", "locale": "en-MY"}
    assert u.consents == []
    assert u.mfa_enabled is False
    assert u.failed_login_count == 0


@pytest.mark.django_db
def test_user_status_choices(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="f@example.com", password="x", org_id=org_id)
    assert u.status == "active"
    u.status = "disabled"
    u.save()
    u.refresh_from_db()
    assert u.status == "disabled"


@pytest.mark.django_db
def test_uses_email_as_username_field(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="g@example.com", password="x", org_id=org_id)
    assert u.USERNAME_FIELD == "email"
    assert u.get_username() == "g@example.com"


@pytest.mark.django_db
def test_must_change_password_defaults_false(org_id: uuid.UUID) -> None:
    u = User.objects.create_user(email="a@b.co", password="Pw!23456", org_id=org_id)
    assert u.must_change_password is False
