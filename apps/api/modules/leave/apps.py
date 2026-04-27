from django.apps import AppConfig


class LeaveConfig(AppConfig):
    name = "modules.leave"
    label = "leave"
    verbose_name = "Leave management"
    default_auto_field = "django.db.models.BigAutoField"
