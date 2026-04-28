from django.apps import AppConfig


class NotificationConfig(AppConfig):
    name = "modules.notification"
    label = "notification"
    verbose_name = "Notifications"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
