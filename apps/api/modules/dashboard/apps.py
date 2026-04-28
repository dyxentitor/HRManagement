from django.apps import AppConfig


class DashboardConfig(AppConfig):
    name = "modules.dashboard"
    label = "dashboard"
    verbose_name = "Dashboards & Approvals Inbox"
    default_auto_field = "django.db.models.BigAutoField"
