from django.apps import AppConfig


class WorkflowConfig(AppConfig):
    name = "common.workflow"
    label = "workflow"
    verbose_name = "Workflow engine"
    default_auto_field = "django.db.models.BigAutoField"
