"""CSV import service for payroll. Fail-soft per row."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from modules.employee.models import Employee
from modules.payslip.models import PayrollRun, PayslipRecord
from modules.payslip.parsers.csv_parser import parse_csv

REQUIRED_COLUMNS = {"employee_code", "gross", "net", "components_json", "deductions_json"}


def _to_decimal(value: str, field: str, row_num: int) -> Decimal:
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"row {row_num}: invalid {field} value '{value}'") from exc


def import_csv(*, run: PayrollRun, csv_text: str) -> tuple[int, list[dict[str, Any]]]:
    """Validate + insert payslip rows for the run's period.

    Returns (n_imported, errors). The run is marked 'validated' on
    fully-clean import or 'draft' if any rows errored (HR can fix and re-upload).
    """
    rows, _ = parse_csv(csv_text)

    if not rows:
        return 0, [{"row": 0, "error": "empty CSV"}]

    if not REQUIRED_COLUMNS.issubset(rows[0].keys()):
        missing = REQUIRED_COLUMNS - set(rows[0].keys())
        return 0, [{"row": 1, "error": f"missing columns: {sorted(missing)}"}]

    errors: list[dict[str, Any]] = []
    n_imported = 0

    with transaction.atomic():
        # Wipe existing draft payslips for this period (re-import scenario)
        PayslipRecord.all_objects.filter(
            period=run.period,
            source="csv_import",
            status="draft",
            deleted_at__isnull=True,
        ).delete()

        for row in rows:
            row_num = row.get("_row", 0)
            try:
                emp_code = row["employee_code"]
                emp = Employee.all_objects.filter(
                    org_id=run.org_id,
                    employee_code=emp_code,
                    deleted_at__isnull=True,
                ).first()
                if emp is None:
                    raise ValueError(f"row {row_num}: unknown employee_code '{emp_code}'")

                gross = _to_decimal(row["gross"], "gross", row_num)
                net = _to_decimal(row["net"], "net", row_num)

                components = json.loads(row["components_json"] or "{}")
                deductions = json.loads(row["deductions_json"] or "{}")

                # Balance check: gross - sum(deductions) ≈ net (within MYR 0.01)
                deductions_total = sum(Decimal(str(v)) for v in deductions.values())
                expected = gross - deductions_total
                if abs(expected - net) > Decimal("0.01"):
                    raise ValueError(
                        f"row {row_num}: gross/deductions/net don't balance "
                        f"(gross {gross} - deductions {deductions_total} = {expected}, "
                        f"but net = {net})"
                    )

                PayslipRecord.all_objects.create(
                    org_id=run.org_id,
                    employee_id=emp.id,
                    period=run.period,
                    gross=gross,
                    deductions=deductions,
                    net=net,
                    currency_code=row.get("currency_code") or "MYR",
                    components=components,
                    source="csv_import",
                    status="draft",
                )
                n_imported += 1

            except (ValueError, json.JSONDecodeError) as exc:
                errors.append({"row": row_num, "error": str(exc)})

        run.row_count = n_imported
        run.errors = errors
        run.status = (
            "validated" if n_imported > 0 and not errors else "draft" if errors else "validated"
        )
        run.save(update_fields=["row_count", "errors", "status", "updated_at"])

    return n_imported, errors
