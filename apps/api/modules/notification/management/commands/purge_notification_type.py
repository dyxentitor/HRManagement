"""Management command: delete all Notification rows of a given type (idempotent)."""

from django.core.management.base import BaseCommand

from modules.notification.models import Notification


class Command(BaseCommand):
    help = "Delete all Notification rows of a given type (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("notification_type", help="The notification type to purge.")

    def handle(self, *args, **opts):
        n, _ = Notification.objects.filter(type=opts["notification_type"]).delete()
        self.stdout.write(
            self.style.SUCCESS(f"Deleted {n} '{opts['notification_type']}' notification(s).")
        )
