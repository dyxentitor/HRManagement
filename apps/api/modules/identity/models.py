"""Custom User model — multi-tenant aware, MFA-ready."""

from __future__ import annotations

import uuid
from typing import Any, ClassVar

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from common.fields import EncryptedCharField


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

    @property
    def roles(self):
        """Return the Roles assigned to this user (via UserRole join)."""
        return Role.objects.filter(user_links__user=self)


class Permission(models.Model):
    """Global permission catalogue. Codes follow `<module>:<resource>:<action>[:<scope>]`."""

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=128, unique=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "identity_permission"
        ordering = ("code",)

    def __str__(self) -> str:
        return self.code


class Role(models.Model):
    """Org-scoped role bundle. `code` is unique within an org."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    description = models.CharField(max_length=255, blank=True)
    is_system = models.BooleanField(default=False)

    permissions = models.ManyToManyField(
        Permission,
        through="RolePermission",
        related_name="roles",
    )

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "identity_role"
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["org_id", "code"], name="role_unique_code_per_org"),
        ]
        indexes: ClassVar = [models.Index(fields=["org_id"])]

    def __str__(self) -> str:
        return f"{self.code}@{self.org_id}"


class RolePermission(models.Model):
    """Through-table for Role.permissions."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="role_links")

    class Meta:
        db_table = "identity_role_permission"
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["role", "permission"], name="role_permission_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.role} -> {self.permission}"


class UserRole(models.Model):
    """Assigns Roles to Users.

    ``granted_by`` is the user that performed the grant (nullable for system seeds).
    """

    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="user_roles",
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_links")
    granted_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grants_made",
    )
    granted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "identity_user_role"
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["user", "role"], name="user_role_unique"),
        ]
        indexes: ClassVar = [models.Index(fields=["user"]), models.Index(fields=["role"])]

    def __str__(self) -> str:
        return f"{self.user} -> {self.role}"


class Session(models.Model):
    """Tracks issued refresh tokens for server-side revocation.

    `refresh_token_hash` is the sha256 of the refresh JWT; storing the hash
    means the raw token never sits in the DB.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="sessions")
    refresh_token_hash = models.CharField(max_length=64, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_session"
        indexes: ClassVar = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"session({self.user.email}, created={self.created_at:%Y-%m-%d %H:%M})"


class MFADevice(models.Model):
    """A user's TOTP device. We currently support one device per user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="mfa_device",
    )
    type = models.CharField(max_length=16, default="totp")
    secret = EncryptedCharField(max_length=64)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "identity_mfa_device"

    def __str__(self) -> str:
        return f"mfa({self.user.email}, type={self.type})"
