"""Test-only migration creating tables for _SampleGlobal and _SampleTenant.

These models live in test code and are referenced by tests in test_models.py.
The migration is shipped with the app so test runs (which migrate fresh sqlite)
have the tables available. Tables are otherwise harmless in dev/prod.
"""
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies: list = []

    operations = [
        migrations.CreateModel(
            name="_SampleGlobal",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, editable=False, null=True)),
                ("name", models.CharField(max_length=64)),
            ],
            options={"abstract": False},
        ),
        migrations.CreateModel(
            name="_SampleTenant",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, editable=False, null=True)),
                ("org_id", models.UUIDField(db_index=True, editable=False)),
                ("name", models.CharField(max_length=64)),
            ],
            options={"abstract": False},
        ),
        migrations.CreateModel(
            name="_SecretBox",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("secret", models.BinaryField(null=True)),
            ],
            options={},
        ),
    ]
