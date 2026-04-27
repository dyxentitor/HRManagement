"""Add an FK constraint from departments.head_employee_id to employee_employee.id.

M1 left head_employee_id as a UUIDField. Now that the Employee model exists,
add a real FK constraint on Postgres. No-op on SQLite (test runs).
"""
from typing import ClassVar

from django.db import migrations


def add_fk_postgres(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "ALTER TABLE organization_department "
        "ADD CONSTRAINT fk_department_head_employee "
        "FOREIGN KEY (head_employee_id) "
        "REFERENCES employee_employee (id) "
        "ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;"
    )


def drop_fk_postgres(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "ALTER TABLE organization_department "
        "DROP CONSTRAINT IF EXISTS fk_department_head_employee;"
    )


class Migration(migrations.Migration):
    dependencies: ClassVar = [
        ("organization", "0002_department_and_more"),
        ("employee", "0001_initial"),
    ]

    operations: ClassVar = [
        migrations.RunPython(add_fk_postgres, drop_fk_postgres),
    ]
