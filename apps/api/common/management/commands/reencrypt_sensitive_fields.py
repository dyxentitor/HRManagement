"""Re-encrypt every EncryptedCharField value under the current primary key.

Key-rotation flow (see docs/runbooks/rotate-encryption-keys.md):
  1. Set HRMS_FIELD_ENCRYPTION_PREV_KEY = old key, HRMS_FIELD_ENCRYPTION_KEY = new key.
     Existing ciphertext still decrypts (MultiFernet), new writes use the new key.
  2. python manage.py reencrypt_sensitive_fields --dry-run   # report scope
  3. python manage.py reencrypt_sensitive_fields             # migrate all rows
  4. Remove HRMS_FIELD_ENCRYPTION_PREV_KEY (all data now under the new key).

Idempotent: re-running simply re-encrypts already-current rows under the same key.
"""

from __future__ import annotations

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction

from common.fields import EncryptedCharField


class Command(BaseCommand):
    help = "Re-encrypt all EncryptedCharField values under the current primary key."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report scope without writing.")
        parser.add_argument("--batch-size", type=int, default=500)

    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        batch = opts["batch_size"]
        grand = 0
        for model in apps.get_models():
            enc = [f.name for f in model._meta.get_fields() if isinstance(f, EncryptedCharField)]
            if not enc:
                continue
            # Include soft-deleted rows (they still hold encrypted PII).
            manager = getattr(model, "all_objects", model._base_manager)
            count = 0
            for obj in manager.all().iterator(chunk_size=batch):
                # Reading decrypts via MultiFernet (new OR prev key); saving
                # re-encrypts with the primary (new) key.
                for name in enc:
                    setattr(obj, name, getattr(obj, name))
                if not dry:
                    with transaction.atomic():
                        obj.save(update_fields=enc)
                count += 1
            grand += count
            self.stdout.write(f"  {model._meta.label}: {count} rows · fields={enc}")

        verb = "would re-encrypt" if dry else "re-encrypted"
        self.stdout.write(self.style.SUCCESS(f"{verb} {grand} rows."))
