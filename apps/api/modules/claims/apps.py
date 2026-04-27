from django.apps import AppConfig


class ClaimsConfig(AppConfig):
    name = "modules.claims"
    label = "claims"
    verbose_name = "Claims"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
