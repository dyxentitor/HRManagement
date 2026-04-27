from django.apps import AppConfig


class IdentityConfig(AppConfig):
    name = "modules.identity"
    label = "identity"
    verbose_name = "Identity & RBAC"
    default_auto_field = "django.db.models.BigAutoField"
