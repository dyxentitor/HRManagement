from django.apps import AppConfig


class PayslipConfig(AppConfig):
    name = "modules.payslip"
    label = "payslip"
    verbose_name = "Payslip & Payroll"
    default_auto_field = "django.db.models.BigAutoField"
