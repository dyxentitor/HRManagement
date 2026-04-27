from django.apps import AppConfig


class AttendanceConfig(AppConfig):
    name = "modules.attendance"
    label = "attendance"
    verbose_name = "Attendance"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
