"""Break-glass recovery — grant the org_admin role to a user by email.

    python manage.py bootstrap_admin <email>

Use this out-of-band path when a bad role edit or a guard has locked every admin out of an org. It
bypasses the in-app guards by design. Idempotent.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from modules.identity.models import Role, User, UserRole
from modules.identity.services.permissions import invalidate_user_perms


class Command(BaseCommand):
    help = "Grant org_admin to a user by email (break-glass recovery)."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **opts):
        user = User.objects.filter(email__iexact=opts["email"]).first()
        if user is None:
            raise CommandError(f"No user with email {opts['email']!r}")
        role = Role.objects.filter(org_id=user.org_id, code="org_admin").first()
        if role is None:
            raise CommandError(f"No org_admin role exists in org {user.org_id}")
        _, created = UserRole.objects.get_or_create(user=user, role=role)
        invalidate_user_perms(user.id)
        verb = "Granted" if created else "Confirmed (already had)"
        self.stdout.write(self.style.SUCCESS(f"{verb} org_admin for {user.email}"))
