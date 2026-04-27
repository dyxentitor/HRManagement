from django.apps import AppConfig


class LeaveConfig(AppConfig):
    name = "modules.leave"
    label = "leave"
    verbose_name = "Leave management"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
