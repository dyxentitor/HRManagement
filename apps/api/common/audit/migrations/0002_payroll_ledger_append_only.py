"""Postgres trigger making payroll_audit_ledger append-only at the DB level.

The trigger fires BEFORE UPDATE OR DELETE and raises an exception. This is
defense in depth on top of the application-layer rule that nobody calls .save()
or .delete() on PayrollAuditLedger except the audit service's append_payroll().

SQLite test runs: migration is a no-op (trigger is postgres-only).
"""

from django.db import migrations

SQL_UP = """
CREATE OR REPLACE FUNCTION payroll_ledger_block_modify() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'payroll_audit_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_ledger_block_update ON payroll_audit_ledger;
DROP TRIGGER IF EXISTS payroll_ledger_block_delete ON payroll_audit_ledger;

CREATE TRIGGER payroll_ledger_block_update
    BEFORE UPDATE ON payroll_audit_ledger
    FOR EACH ROW EXECUTE FUNCTION payroll_ledger_block_modify();

CREATE TRIGGER payroll_ledger_block_delete
    BEFORE DELETE ON payroll_audit_ledger
    FOR EACH ROW EXECUTE FUNCTION payroll_ledger_block_modify();
"""

SQL_DOWN = """
DROP TRIGGER IF EXISTS payroll_ledger_block_update ON payroll_audit_ledger;
DROP TRIGGER IF EXISTS payroll_ledger_block_delete ON payroll_audit_ledger;
DROP FUNCTION IF EXISTS payroll_ledger_block_modify();
"""


def apply_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(SQL_UP)


def unapply_trigger(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(SQL_DOWN)


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [
        migrations.RunPython(apply_trigger, reverse_code=unapply_trigger),
    ]
