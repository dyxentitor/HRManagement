"""Three-step migration: add nullable code, backfill, make non-null + unique."""

from __future__ import annotations

from django.db import migrations, models


def backfill_codes(apps, schema_editor):
    """Set code = name[:1].upper() for every existing shift.

    On collision (same org_id + same first letter), the second one becomes
    name[:2].upper(); a WARNING is logged.
    """
    import logging

    log = logging.getLogger(__name__)
    Shift = apps.get_model("schedule", "Shift")
    used: dict = {}
    for shift in Shift.objects.filter(deleted_at__isnull=True).order_by("created_at"):
        candidate = (shift.name[:1] or "X").upper()
        org_used = used.setdefault(shift.org_id, set())
        if candidate in org_used:
            candidate = (shift.name[:2] or "XX").upper().ljust(2, "X")[:3]
            log.warning(
                "Shift.code collision for org=%s name=%s; using '%s'",
                shift.org_id, shift.name, candidate,
            )
        org_used.add(candidate)
        shift.code = candidate
        shift.save(update_fields=["code"])


def reverse_noop(apps, schema_editor):
    """No-op reverse — column drop in operation 3 handles unrolling."""


class Migration(migrations.Migration):
    dependencies = [
        ("schedule", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="shift",
            name="code",
            field=models.CharField(max_length=3, null=True),
        ),
        migrations.RunPython(backfill_codes, reverse_noop),
        migrations.AlterField(
            model_name="shift",
            name="code",
            field=models.CharField(max_length=3),
        ),
        migrations.AddConstraint(
            model_name="shift",
            constraint=models.UniqueConstraint(
                fields=("org_id", "code"),
                condition=models.Q(("deleted_at__isnull", True)),
                name="shift_unique_code_per_org",
            ),
        ),
    ]
