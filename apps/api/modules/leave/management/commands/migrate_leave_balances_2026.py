"""One-time migration of the 2026 leave balances from ``References/Leave 2026.xlsx``.

Source of truth: the HR-maintained workbook. Mappings below were confirmed with
the business owner before this command was written:

* ``AL`` -> ANNUAL, ``ML`` -> MEDICAL (Sick Leave), ``HL`` -> HOSPITALIZATION,
  ``BL`` -> COMPASSIONATE (bereavement, 1 day).
* The single "2025 (Carried forward)" column applies to ANNUAL only.
* Carry-forward has no expiry (``carried_forward_expires_at`` stays NULL).
* "Leave Taken" cells were free text (e.g. "4&5&6 Feb 26"); the day counts below
  are the agreed parse, reviewed line by line.
* Four workbook rows carry no leave data (Ng Eick Khiam, Yap Mee Ling,
  Pang Yat Ming, Ahmad Arif Aiman) and are intentionally NOT migrated. The first
  two have no employee record at all.
* Syafiq maps to the ACTIVE record EMP-2026-0002, not the archived duplicate
  EMP-2026-0001.

Idempotent: each (employee, leave type) writes ledger rows keyed on a
deterministic reference, so re-running reports "already migrated" and changes
nothing. Everything runs in one transaction -- a failure rolls the whole
migration back.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.employee.models import Employee
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.ledger import LeaveLedgerService
from modules.organization.models import Organization

YEAR = 2026
REFERENCE_TYPE = "excel_leave_2026"
NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

# (employee_code, workbook name, {leave_type_code: (entitled, carried_forward, taken)})
MIGRATION_ROWS: list[tuple[str, str, dict[str, tuple[float, float, float]]]] = [
    # Excel row 9: Tan Mun Kit
    (
        "EMP-2026-0015",
        "Tan Mun Kit",
        {
            "ANNUAL": (18.0, 53.5, 1.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 10: Muhamad Narzwan Bin Mohd Puad
    (
        "EMP-2026-0004",
        "Muhamad Narzwan Bin Mohd Puad",
        {
            "ANNUAL": (12.0, 20.0, 3.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 11: Lee Wei Leong
    (
        "EMP-2026-0005",
        "Lee Wei Leong",
        {
            "ANNUAL": (12.0, 15.0, 1.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 1.0),
        },
    ),
    # Excel row 12: Muhamad Syafiq Bin Sulaiman
    (
        "EMP-2026-0002",
        "Muhamad Syafiq Bin Sulaiman",
        {
            "ANNUAL": (10.0, 11.0, 3.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 13: Tasneem Amelia Binti Johan
    (
        "EMP-2026-0012",
        "Tasneem Amelia Binti Johan",
        {
            "ANNUAL": (8.0, 0.0, 1.5),
            "MEDICAL": (16.0, 0.0, 2.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 14: Fatini Binti Azahar
    (
        "EMP-2026-0006",
        "Fatini Binti Azahar",
        {
            "ANNUAL": (10.0, 6.0, 1.5),
            "MEDICAL": (16.0, 0.0, 2.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 1.0),
        },
    ),
    # Excel row 15: Anas Bin Danial
    (
        "EMP-2026-0003",
        "Anas Bin Danial",
        {
            "ANNUAL": (10.0, 6.0, 2.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 1.0),
        },
    ),
    # Excel row 16: Esther Leslie Bala
    (
        "EMP-2026-0010",
        "Esther Leslie Bala",
        {
            "ANNUAL": (8.0, 1.5, 0.0),
            "MEDICAL": (16.0, 0.0, 0.0),
            "HOSPITALIZATION": (46.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 17: Ahmad Akmal Haziq bin Zulkifli
    (
        "EMP-2026-0007",
        "Ahmad Akmal Haziq bin Zulkifli",
        {
            "ANNUAL": (6.0, 0.0, 0.0),
            "MEDICAL": (12.0, 0.0, 0.0),
            "HOSPITALIZATION": (34.5, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 18: Lim Min Wei
    (
        "EMP-2026-0008",
        "Lim Min Wei",
        {
            "ANNUAL": (6.0, 0.0, 1.0),
            "MEDICAL": (12.0, 0.0, 2.0),
            "HOSPITALIZATION": (34.5, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
    # Excel row 20: Thivya Laxhimi A/P Selvaraja
    (
        "EMP-2026-0009",
        "Thivya Laxhimi A/P Selvaraja",
        {
            "ANNUAL": (4.0, 0.0, 0.0),
            "MEDICAL": (8.0, 0.0, 0.0),
            "HOSPITALIZATION": (23.0, 0.0, 0.0),
            "COMPASSIONATE": (1.0, 0.0, 0.0),
        },
    ),
]


def _ref_id(employee_code: str, type_code: str) -> uuid.UUID:
    """Stable per (employee, leave type) reference so re-runs are no-ops."""
    return uuid.uuid5(NAMESPACE, f"leave{YEAR}:{employee_code}:{type_code}")


class Command(BaseCommand):
    help = "Migrate the 2026 leave balances from the HR workbook (idempotent)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--org-slug", default="provintell")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show exactly what would change and exit without writing.",
        )

    def handle(self, *args, **options) -> None:
        dry = options["dry_run"]
        org = Organization.objects.filter(slug=options["org_slug"]).first()
        if org is None:
            raise CommandError(f"No organization with slug {options['org_slug']!r}")

        codes = {c for _, _, t in MIGRATION_ROWS for c in t}
        types = {
            lt.code: lt
            for lt in LeaveType.all_objects.filter(
                org_id=org.id, code__in=codes, deleted_at__isnull=True
            )
        }
        missing = codes - set(types)
        if missing:
            raise CommandError(f"Missing leave types in {org.slug}: {sorted(missing)}")

        planned, skipped, problems = [], [], []

        for emp_code, wb_name, per_type in MIGRATION_ROWS:
            emp = Employee.all_objects.filter(
                org_id=org.id, employee_code=emp_code, deleted_at__isnull=True
            ).first()
            if emp is None:
                problems.append(f"{emp_code} ({wb_name}): no active employee record - SKIPPED")
                continue

            for type_code, (ent, cf, taken) in per_type.items():
                lt = types[type_code]
                ref = _ref_id(emp_code, type_code)
                already = LeaveBalanceLedger.objects.filter(
                    reference_type=REFERENCE_TYPE, reference_id=ref
                ).exists()
                bal = LeaveBalance.all_objects.filter(
                    org_id=org.id,
                    employee_id=emp.id,
                    leave_type=lt,
                    year=YEAR,
                    deleted_at__isnull=True,
                ).first()
                before = (
                    (bal.entitled, bal.accrued, bal.taken, bal.carried_forward)
                    if bal
                    else (Decimal("0"), Decimal("0"), Decimal("0"), Decimal("0"))
                )
                row = {
                    "emp": emp,
                    "code": emp_code,
                    "wb_name": wb_name,
                    "lt": lt,
                    "type_code": type_code,
                    "ref": ref,
                    "ent": Decimal(str(ent)),
                    "cf": Decimal(str(cf)),
                    "taken": Decimal(str(taken)),
                    "before": before,
                    "bal": bal,
                }
                (skipped if already else planned).append(row)

        self._report(org, planned, skipped, problems, dry)

        if dry:
            self.stdout.write(self.style.WARNING("\nDRY RUN - nothing was written."))
            return
        if not planned:
            self.stdout.write(self.style.SUCCESS("\nNothing to do; already migrated."))
            return

        with transaction.atomic():
            for row in planned:
                self._apply(org, row)
        self.stdout.write(
            self.style.SUCCESS(f"\nApplied {len(planned)} balance rows in one transaction.")
        )

    def _apply(self, org, row) -> None:
        bal = row["bal"]
        if bal is None:
            bal = LeaveBalance.all_objects.create(
                org_id=org.id,
                employee_id=row["emp"].id,
                leave_type=row["lt"],
                year=YEAR,
                entitled=Decimal("0"),
                accrued=Decimal("0"),
                taken=Decimal("0"),
                pending=Decimal("0"),
                carried_forward=Decimal("0"),
            )
        bal.entitled = row["ent"]
        bal.accrued = row["ent"]
        bal.carried_forward = row["cf"]
        bal.taken = row["taken"]
        bal.save(update_fields=["entitled", "accrued", "carried_forward", "taken", "updated_at"])

        common = dict(
            org_id=org.id,
            employee_id=row["emp"].id,
            leave_type=row["lt"],
            reference_type=REFERENCE_TYPE,
            reference_id=row["ref"],
        )
        LeaveLedgerService.append(delta=row["ent"], reason="accrual", **common)
        if row["cf"]:
            LeaveLedgerService.append(delta=row["cf"], reason="carry_forward", **common)
        if row["taken"]:
            LeaveLedgerService.append(delta=-row["taken"], reason="manual_adjustment", **common)

    def _report(self, org, planned, skipped, problems, dry) -> None:
        w = self.stdout.write
        w("=" * 96)
        w(f"LEAVE BALANCE MIGRATION {YEAR} - org={org.slug} - {'PREVIEW' if dry else 'EXECUTE'}")
        w("=" * 96)
        emps = {r["code"] for r in planned}
        w(f"Employees to update ......... {len(emps)}")
        w(f"Balance rows to write ....... {len(planned)}")
        w(f"Already migrated (skip) ..... {len(skipped)}")
        w(f"Problems / unmatched ........ {len(problems)}")
        w(f"Leave types affected ........ {sorted({r['type_code'] for r in planned})}")
        if problems:
            w("\nPROBLEMS:")
            for p in problems:
                w(self.style.ERROR(f"  ! {p}"))
        if skipped:
            w("\nALREADY MIGRATED (no change):")
            for r in skipped:
                w(f"  - {r['code']:<15} {r['type_code']}")
        w("\nPER-ROW CHANGES  (before -> after)")
        w(
            f"  {'employee':<15} {'workbook name':<30} {'type':<16} "
            f"{'entitled':>18} {'carry_fwd':>16} {'taken':>14}"
        )
        w("  " + "-" * 112)
        last = None
        for r in sorted(planned, key=lambda x: (x["code"], x["type_code"])):
            be, _accrued, bt, bc = r["before"]
            name = r["wb_name"][:30] if r["code"] != last else ""
            code = r["code"] if r["code"] != last else ""
            last = r["code"]
            ent_txt = f"{be} -> {r['ent']}"
            cf_txt = f"{bc} -> {r['cf']}"
            taken_txt = f"{bt} -> {r['taken']}"
            w(
                f"  {code:<15} {name:<30} {r['type_code']:<16} "
                f"{ent_txt:>18} {cf_txt:>16} {taken_txt:>14}"
            )
        tot_ent = sum(r["ent"] for r in planned)
        tot_cf = sum(r["cf"] for r in planned)
        tot_tk = sum(r["taken"] for r in planned)
        w("  " + "-" * 112)
        w(f"  TOTALS: entitled={tot_ent}  carried_forward={tot_cf}  taken={tot_tk}")
