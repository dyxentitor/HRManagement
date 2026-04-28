from django.apps import AppConfig


class ReportingConfig(AppConfig):
    name = "common.reporting"
    label = "reporting"
    verbose_name = "Reports"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        # Trigger module-side reports.py imports
        from django.apps import apps

        for app_config in apps.get_app_configs():
            try:
                __import__(f"{app_config.name}.reports")
            except ImportError:
                pass  # Module doesn't have reports.py — fine
