from django.apps import AppConfig


class ScheduleConfig(AppConfig):
    name = "modules.schedule"
    label = "schedule"
    verbose_name = "Schedule & shifts"
    default_auto_field = "django.db.models.BigAutoField"
