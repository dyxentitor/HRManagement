from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Permission, Role, RolePermission, User, UserRole


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "org_id", "status", "mfa_enabled", "is_staff", "last_login_at")
    list_filter = ("status", "mfa_enabled", "is_staff", "is_superuser")
    search_fields = ("email",)
    readonly_fields = (
        "id",
        "last_login_at",
        "last_login_ip",
        "failed_login_count",
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (None, {"fields": ("email", "password", "org_id")}),
        ("Status", {"fields": ("status", "mfa_enabled", "is_active", "is_staff", "is_superuser")}),
        ("Audit", {"fields": ("last_login_at", "last_login_ip", "failed_login_count")}),
        ("Preferences", {"fields": ("preferences", "consents")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Timestamps", {"fields": ("id", "created_at", "updated_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "org_id", "password1", "password2"),
            },
        ),
    )


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "org_id", "is_system")
    list_filter = ("org_id", "is_system")
    search_fields = ("code", "name")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "permission")
    list_filter = ("role__org_id",)
    search_fields = ("role__code", "permission__code")


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "granted_by", "granted_at")
    search_fields = ("user__email", "role__code")
