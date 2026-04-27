"""Custom User model — multi-tenant aware, MFA-ready."""

from __future__ import annotations

import uuid
from typing import Any, ClassVar

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


def _default_preferences() -> dict[str, Any]:
    return {"theme": "system", "locale": "en-MY"}


def _default_consents() -> list[Any]:
    return []


class UserManager(BaseUserManager):
    """Custom manager: enforces email + org_id, hashes passwords."""

    use_in_migrations = True

    def _create_user(
        self,
        email: str,
        password: str | None,
        org_id: uuid.UUID | None,
        **extra: Any,
    ) -> User:
        if not email:
            raise ValueError("email is required")
        if org_id is None:
            raise ValueError("org_id is required")
        # Normalize email: lowercase the domain, preserve local part casing.
        local, _, domain = email.partition("@")
        email = f"{local}@{domain.lower()}" if domain else email
        user = self.model(email=email, org_id=org_id, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(
        self,
        email: str,
        password: str | None = None,
        org_id: uuid.UUID | None = None,
        **extra: Any,
    ) -> User:
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, org_id, **extra)

    def create_superuser(
        self,
        email: str,
        password: str | None = None,
        org_id: uuid.UUID | None = None,
        **extra: Any,
    ) -> User:
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not extra.get("is_staff"):
            raise ValueError("superuser must have is_staff=True")
        if not extra.get("is_superuser"):
            raise ValueError("superuser must have is_superuser=True")
        return self._create_user(email, password, org_id, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """HRMS user. Email is the username; uniqueness is per-org."""

    STATUS_CHOICES = (
        ("active", "Active"),
        ("disabled", "Disabled"),
        ("locked", "Locked"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    email = models.EmailField(max_length=254)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")
    mfa_enabled = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_count = models.IntegerField(default=0)
    preferences = models.JSONField(default=_default_preferences, blank=True)
    consents = models.JSONField(default=_default_consents, blank=True)

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []  # email + password are positional in create_user

    class Meta:
        db_table = "identity_user"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["org_id", "email"],
                condition=models.Q(deleted_at__isnull=True),
                name="user_unique_email_per_org",
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=["org_id"]),
            models.Index(fields=["email"]),
        ]

    def __str__(self) -> str:
        return f"{self.email} (org={self.org_id})"

    def soft_delete(self) -> None:
        """Soft delete. Preserves the row for audit/historic queries."""
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["deleted_at", "is_active", "updated_at"])
