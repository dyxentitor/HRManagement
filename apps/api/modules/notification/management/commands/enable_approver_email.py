"""Backfill: enable email on the submitted-to-approver notification types for
existing users (their rows were seeded email=False before v1.69.0). Idempotent."""

from django.core.management.base import BaseCommand

from modules.notification.models import NotificationPreference

TYPES = [
    "leave.submitted",
    "claim.submitted",
    "incentive.claim_submitted",
    "kpi.review_submitted_self",
]


class Command(BaseCommand):
    help = "Enable email on approver action-required notification types for existing users."

    def handle(self, *args, **options) -> None:
        n = NotificationPreference.objects.filter(
            type__in=TYPES, channel="email", enabled=False
        ).update(enabled=True)
        self.stdout.write(
            self.style.SUCCESS(f"enable_approver_email: {n} preference row(s) enabled")
        )
