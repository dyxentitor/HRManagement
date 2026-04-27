from django.apps import AppConfig


class EmployeeConfig(AppConfig):
    name = "modules.employee"
    label = "employee"
    verbose_name = "Employees"
    default_auto_field = "django.db.models.BigAutoField"
