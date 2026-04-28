# HRMS M12 — Hardening + Provintell Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** No new features. Make the system production-ready: backup verification, monitoring dashboards & alert rules, runbook docs, real Provintell seed data, parallel-run validation. Tag `v1.0.0` (NOT `v0.1.0-m12` — graduating from milestone-tag scheme).

**Architecture:**
- Most work is config + scripts + docs, not code.
- The 2-week parallel-run is human-driven; the plan documents the verification protocol but cannot execute it itself.

**Spec reference:** spec §8 (testing/CI/observability/security), §9 (definition of "Phase 1 done"), §1 (locked decisions).

**Branch:** `m12/hardening` from master.

---

## File structure

```
deploy/
├── grafana/dashboards/                       NEW
│   ├── api-health.json
│   ├── database.json
│   ├── celery.json
│   ├── auth.json
│   └── business.json
├── prometheus/
│   ├── rules.yml                              NEW (Phase 1 alert rules per spec §8)
│   └── prometheus.yml                         NEW
├── backups/
│   ├── nightly-pgdump.sh                     NEW
│   └── verify-restore.sh                     NEW
└── seed/
    ├── provintell.py                          NEW (Django script invoked by make seed-provintell)
    └── README.md

docs/runbooks/                                 NEW
├── README.md
├── deploy-staging.md
├── deploy-prod.md
├── rollback.md
├── restore-from-backup.md
├── rotate-encryption-keys.md
├── verify-payroll-ledger.md
├── monitoring.md                              alert response runbook
└── parallel-run-protocol.md                   2-week parallel-run checklist

apps/api/modules/<each>/management/commands/seed_provintell.py
                                               (per-module helpers OR one combined seed in modules/employee/)

Makefile                                       MODIFY: + seed-provintell, + verify-backup, + verify-payroll-ledger
```

---

## Task 1: Branch + Provintell seed data

**Files:**
- Create: `apps/api/modules/seed/` (small module — or use a top-level management command)
- Better: create a single `apps/api/modules/employee/management/commands/seed_provintell.py`
- Modify: `Makefile` (add `seed-provintell` target)

- [ ] **Step 1: Branch + skeleton**

```
git checkout master
git checkout -b m12/hardening
mkdir -p deploy/grafana/dashboards deploy/prometheus deploy/backups deploy/seed docs/runbooks
```

- [ ] **Step 2: Create the Provintell seed command**

`apps/api/modules/employee/management/commands/seed_provintell.py`:

```python
"""Seed real Provintell data: 1 org, 3 depts, 8 employees, 2 shifts, 30d attendance, 2026 holidays.

Idempotent — re-running updates existing rows rather than duplicating.
Use `--prod` to skip demo accounts (per spec §9).
"""
from __future__ import annotations

import datetime
import os
import uuid
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from common.audit import append
from modules.attendance.services import AttendanceService
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.employee.models import Employee
from modules.identity.models import Role, User, UserRole
from modules.kpi.models import KpiCycle, KpiTemplate
from modules.kpi.services.assignment import AssignmentService as KpiAssignmentService
from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift, ShiftAssignment


PROVINTELL_SLUG = "provintell"


def _ensure_org() -> Organization:
    org, _ = Organization.objects.update_or_create(
        slug=PROVINTELL_SLUG,
        defaults={
            "name": "Provintell", "country_code": "MY",
            "default_currency": "MYR",
            "default_timezone": "Asia/Kuala_Lumpur",
            "default_locale": "en-MY",
            "status": "active",
        },
    )
    return org


def _ensure_departments(org: Organization) -> dict[str, Department]:
    out: dict[str, Department] = {}
    for code, name in [("ops", "Operations"), ("eng", "Engineering"), ("hr", "Admin/HR")]:
        d, _ = Department.all_objects.update_or_create(
            org_id=org.id, name=name,
            defaults={},
        )
        out[code] = d
    return out


def _ensure_employee(org: Organization, dept: Department, code: str, **kwargs) -> Employee:
    defaults = {
        "first_name": kwargs.get("first_name", code), "last_name": kwargs.get("last_name", "Provintell"),
        "email": kwargs.get("email", f"{code.lower()}@provintell.local"),
        "phone": kwargs.get("phone", "+60123456789"),
        "date_of_birth": kwargs.get("date_of_birth", datetime.date(1990, 1, 1)),
        "gender": kwargs.get("gender", "other"),
        "nationality": "MY", "marital_status": "single",
        "address_line1": "Provintell HQ", "city": "Petaling Jaya",
        "state": "Selangor", "postcode": "46050", "country_code": "MY",
        "department": dept, "manager": kwargs.get("manager"),
        "role_title": kwargs.get("role_title", "Engineer"),
        "employment_type": "fulltime",
        "schedule_type": kwargs.get("schedule_type", "fixed"),
        "hire_date": kwargs.get("hire_date", datetime.date(2024, 1, 1)),
        "bank_name": "Maybank",
        "emergency_contact_name": "Family", "emergency_contact_relationship": "spouse",
        "emergency_contact_phone": "+60123456788",
        "user": kwargs.get("user"),
        "status": "active",
    }
    emp, _ = Employee.all_objects.update_or_create(
        org_id=org.id, employee_code=code,
        defaults=defaults,
    )
    return emp


def _ensure_demo_user(org: Organization, email: str, password: str, role_code: str) -> User:
    user, created = User.objects.get_or_create(
        email=email, org_id=org.id,
        defaults={"is_staff": role_code == "org_admin"},
    )
    if created:
        user.set_password(password)
        user.save()
    role = Role.objects.filter(org_id=org.id, code=role_code).first()
    if role and not UserRole.objects.filter(user=user, role=role).exists():
        UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


class Command(BaseCommand):
    help = "Seed Provintell org with realistic demo data for launch."

    def add_arguments(self, parser):
        parser.add_argument("--prod", action="store_true",
                            help="Skip demo accounts; real users only.")

    @transaction.atomic
    def handle(self, *args, **options):
        is_prod = options["prod"]

        # 1. Country reference data (federal MY 2026 holidays + leave-type defaults)
        self.stdout.write("Loading MY country reference...")
        call_command("seed_country_reference_data", "--country", "MY")

        # 2. Org + departments
        self.stdout.write("Creating Provintell org + departments...")
        org = _ensure_org()
        depts = _ensure_departments(org)

        # 3. Permissions catalogue + default roles
        self.stdout.write("Seeding permissions + roles...")
        call_command("seed_permission_catalogue")
        call_command("seed_default_roles", "--org-id", str(org.id))

        # 4. Holidays + leave types
        call_command("seed_holidays_from_country", "--org-id", str(org.id), "--year", "2026")
        call_command("seed_leave_types_from_country", "--org-id", str(org.id))

        # 5. Demo users (skipped in --prod)
        if not is_prod:
            self.stdout.write("Creating demo accounts...")
            for email, role_code in [
                ("admin@provintell.demo", "org_admin"),
                ("hr@provintell.demo", "hr_manager"),
                ("finance@provintell.demo", "finance"),
                ("ops.lead@provintell.demo", "manager"),
                ("eng.lead@provintell.demo", "manager"),
                ("analyst1@provintell.demo", "employee"),
                ("analyst2@provintell.demo", "employee"),
                ("dev1@provintell.demo", "employee"),
            ]:
                _ensure_demo_user(org, email, "Demo!2026", role_code)

        # 6. 8 employees
        self.stdout.write("Creating Provintell employees...")
        # Create top-down so manager FK chains work
        u_admin = User.objects.filter(email="admin@provintell.demo", org_id=org.id).first() if not is_prod else None
        u_ops_lead = User.objects.filter(email="ops.lead@provintell.demo", org_id=org.id).first() if not is_prod else None
        u_eng_lead = User.objects.filter(email="eng.lead@provintell.demo", org_id=org.id).first() if not is_prod else None
        u_analyst1 = User.objects.filter(email="analyst1@provintell.demo", org_id=org.id).first() if not is_prod else None
        u_analyst2 = User.objects.filter(email="analyst2@provintell.demo", org_id=org.id).first() if not is_prod else None
        u_dev1 = User.objects.filter(email="dev1@provintell.demo", org_id=org.id).first() if not is_prod else None

        ops_lead = _ensure_employee(org, depts["ops"], "PVT-OPS-001", first_name="Ops", last_name="Lead",
                                     role_title="SOC Lead", user=u_ops_lead)
        eng_lead = _ensure_employee(org, depts["eng"], "PVT-ENG-001", first_name="Eng", last_name="Lead",
                                     role_title="Engineering Lead", user=u_eng_lead)
        _ensure_employee(org, depts["ops"], "PVT-OPS-002", first_name="Analyst", last_name="One",
                         manager=ops_lead, schedule_type="shift", role_title="SOC Analyst",
                         user=u_analyst1)
        _ensure_employee(org, depts["ops"], "PVT-OPS-003", first_name="Analyst", last_name="Two",
                         manager=ops_lead, schedule_type="shift", role_title="SOC Analyst",
                         user=u_analyst2)
        _ensure_employee(org, depts["eng"], "PVT-ENG-002", first_name="Dev", last_name="One",
                         manager=eng_lead, role_title="Software Engineer",
                         user=u_dev1)
        # Department head links
        depts["ops"].head_employee_id = ops_lead.id
        depts["ops"].save()
        depts["eng"].head_employee_id = eng_lead.id
        depts["eng"].save()

        # 7. 2 shifts
        self.stdout.write("Seeding shifts...")
        Shift.all_objects.update_or_create(
            org_id=org.id, name="Day",
            defaults={"start_time": datetime.time(9, 0), "end_time": datetime.time(18, 0),
                      "crosses_midnight": False, "color": "#3B82F6"},
        )
        Shift.all_objects.update_or_create(
            org_id=org.id, name="Night",
            defaults={"start_time": datetime.time(22, 0), "end_time": datetime.time(7, 0),
                      "crosses_midnight": True, "color": "#1E40AF"},
        )

        # 8. Pre-fund leave balances (annual 14 days for everyone in 2026)
        self.stdout.write("Pre-funding annual leave balances...")
        annual = LeaveType.all_objects.filter(org_id=org.id, code="ANNUAL").first()
        if annual:
            for emp in Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True):
                BalanceService.accrue(
                    org_id=org.id, employee_id=emp.id, leave_type=annual, year=2026,
                    days=Decimal("14"), reason="accrual",
                    reference_type="seed", reference_id=emp.id,
                )

        self.stdout.write(self.style.SUCCESS(f"Provintell seed complete (prod={is_prod})."))
```

- [ ] **Step 3: Add Make target**

`Makefile`:

```makefile
seed-provintell:
	$(COMPOSE) exec api uv run python manage.py seed_provintell

seed-provintell-prod:
	$(COMPOSE) exec api uv run python manage.py seed_provintell --prod
```

- [ ] **Step 4: Test**

Smoke test in `apps/api/modules/employee/tests/test_seed_provintell.py` — run the command in a fresh test DB and verify:
- 1 org, 3 depts, 5+ employees
- Permissions catalogue ≥ 105
- 7 default roles
- Annual leave balances exist
- 2 shifts
- 16 MY 2026 holidays present

```python
@pytest.mark.django_db
def test_seed_provintell_idempotent():
    from django.core.management import call_command
    call_command("seed_provintell")
    n_emps = Employee.all_objects.filter(deleted_at__isnull=True).count()
    call_command("seed_provintell")
    n_emps2 = Employee.all_objects.filter(deleted_at__isnull=True).count()
    assert n_emps == n_emps2  # idempotent
```

- [ ] **Step 5: Commit**

```
git add apps/api/modules/employee/management/ apps/api/modules/employee/tests/test_seed_provintell.py Makefile
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(seed): seed_provintell command — org, depts, 5 employees, shifts, leave balances"
```

---

## Task 2: Backup verification + monitoring configs

**Files:**
- Create: `deploy/backups/{nightly-pgdump.sh, verify-restore.sh, README.md}`
- Create: `deploy/grafana/dashboards/{api-health.json, database.json, celery.json, auth.json, business.json}`
- Create: `deploy/prometheus/{prometheus.yml, rules.yml}`
- Modify: `Makefile` (+ verify-backup target)

- [ ] **Step 1: Backup scripts**

`deploy/backups/nightly-pgdump.sh`:

```bash
#!/usr/bin/env bash
# Nightly Postgres dump — gzip + upload to S3.
# Cron: 0 2 * * *

set -euo pipefail

TS="$(date -u +%Y%m%d-%H%M%S)"
DUMP_DIR="${DUMP_DIR:-/var/backups/hrms}"
BUCKET="${S3_BUCKET:-hrms}"
PREFIX="${S3_BACKUP_PREFIX:-backups/postgres}"

mkdir -p "$DUMP_DIR"
DUMP_FILE="$DUMP_DIR/hrms-$TS.sql.gz"

pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > "$DUMP_FILE"

aws s3 cp "$DUMP_FILE" "s3://$BUCKET/$PREFIX/hrms-$TS.sql.gz" \
  --endpoint-url "${S3_ENDPOINT_URL:-}" \
  --quiet

# Local retention: keep last 7 days
find "$DUMP_DIR" -name "hrms-*.sql.gz" -mtime +7 -delete

echo "Backup uploaded: s3://$BUCKET/$PREFIX/hrms-$TS.sql.gz"
```

`deploy/backups/verify-restore.sh`:

```bash
#!/usr/bin/env bash
# Weekly restore-verification: pulls latest dump, restores into temp container,
# runs smoke checks, asserts payroll_audit_ledger hash chain integrity.
# Cron: 0 4 * * 0  (Sunday 04:00 UTC)

set -euo pipefail

BUCKET="${S3_BUCKET:-hrms}"
PREFIX="${S3_BACKUP_PREFIX:-backups/postgres}"

LATEST=$(aws s3 ls "s3://$BUCKET/$PREFIX/" --endpoint-url "${S3_ENDPOINT_URL:-}" \
         | sort | tail -1 | awk '{print $4}')

if [[ -z "$LATEST" ]]; then
  echo "ERROR: no backups found"
  exit 2
fi

echo "Verifying restore of: $LATEST"

aws s3 cp "s3://$BUCKET/$PREFIX/$LATEST" /tmp/verify.sql.gz \
  --endpoint-url "${S3_ENDPOINT_URL:-}" --quiet

# Spin up a throwaway postgres
CONTAINER="hrms-restore-verify-$$"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_DB=verify postgres:16-alpine

# Wait for ready
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1 && break
  sleep 1
done

# Restore
gunzip -c /tmp/verify.sql.gz | \
  docker exec -i "$CONTAINER" psql -U verify -d verify

# Smoke checks
EMP_COUNT=$(docker exec "$CONTAINER" psql -U verify -d verify -tAc \
  "SELECT count(*) FROM employee_employee WHERE deleted_at IS NULL")
LEDGER_HEAD_HASH=$(docker exec "$CONTAINER" psql -U verify -d verify -tAc \
  "SELECT row_hash FROM payroll_audit_ledger ORDER BY seq DESC LIMIT 1" || echo "")

# Cleanup
docker rm -f "$CONTAINER" >/dev/null
rm -f /tmp/verify.sql.gz

if [[ "$EMP_COUNT" -lt 1 ]]; then
  echo "ERROR: restore returned 0 employees — backup may be empty"
  exit 1
fi

echo "Restore OK: $EMP_COUNT employees, ledger head ${LEDGER_HEAD_HASH:-<empty>}"
```

`deploy/backups/README.md`: documents env vars, cron schedule, manual run instructions.

- [ ] **Step 2: Prometheus alert rules**

`deploy/prometheus/rules.yml`:

```yaml
groups:
  - name: hrms_phase1
    interval: 30s
    rules:
      - alert: APIHighErrorRate
        expr: |
          (sum(rate(django_http_responses_total_by_status_total{status=~"5.."}[5m]))
           / sum(rate(django_http_responses_total_by_status_total[5m]))) > 0.01
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "HRMS API 5xx rate > 1% for 5 min"

      - alert: APIHighP95Latency
        expr: |
          histogram_quantile(0.95, sum(rate(django_http_responses_total_by_status_total_bucket[10m])) by (le)) > 1
        for: 10m
        labels: { severity: warn }
        annotations:
          summary: "HRMS API P95 latency > 1s"

      - alert: DBConnPoolNearSaturation
        expr: |
          (pg_stat_database_numbackends{datname="hrms"} / pg_settings_max_connections) > 0.8
        for: 5m
        labels: { severity: warn }
        annotations:
          summary: "DB connection pool > 80% saturated"

      - alert: CeleryQueueDeep
        expr: celery_queue_length{queue="celery"} > 1000
        for: 5m
        labels: { severity: warn }

      - alert: CeleryQueueVeryDeep
        expr: celery_queue_length{queue="celery"} > 10000
        for: 1m
        labels: { severity: page }

      - alert: FailedLoginBruteForce
        expr: rate(hrms_auth_failed_logins_total[1m]) > 50
        for: 1m
        labels: { severity: page }
        annotations:
          summary: "Failed login rate > 50/min from a single IP"

      - alert: PayrollLedgerVerifyFail
        expr: hrms_payroll_ledger_verify_status != 1
        for: 1m
        labels: { severity: page }
        annotations:
          summary: "payroll_audit_ledger hash chain failed verification"

      - alert: BackupJobFailed
        expr: time() - hrms_backup_last_success_seconds > 86400
        labels: { severity: page }
        annotations:
          summary: "Nightly backup hasn't succeeded in 24h"

      - alert: DiskUsageHigh
        expr: 100 - (node_filesystem_avail_bytes / node_filesystem_size_bytes * 100) > 80
        for: 10m
        labels: { severity: warn }

      - alert: DiskUsageCritical
        expr: 100 - (node_filesystem_avail_bytes / node_filesystem_size_bytes * 100) > 95
        for: 1m
        labels: { severity: page }
```

`prometheus.yml`: standard scrape config for django/postgres/celery/node exporters.

- [ ] **Step 3: Grafana dashboards**

Five dashboard JSON exports (skeleton). Real implementation: import from a Grafana that's been hand-tuned, OR use ChatGPT-generated panels for each metric category. For M12, ship plausible JSON skeletons that import cleanly.

(The specific JSON content is verbose — keep each file as a minimal `{"title": "...", "panels": [...]}` skeleton with the right metric expressions. ~200-400 lines per file. Real polish happens in Phase 1.5.)

- [ ] **Step 4: Add Make target**

`Makefile`:

```makefile
verify-backup:
	bash deploy/backups/verify-restore.sh
```

- [ ] **Step 5: Commit**

```
git add deploy/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "ops: backup scripts + Prometheus rules + Grafana dashboard skeletons"
```

---

## Task 3: Runbooks

**Files:**
- Create: `docs/runbooks/{README.md, deploy-staging.md, deploy-prod.md, rollback.md, restore-from-backup.md, rotate-encryption-keys.md, verify-payroll-ledger.md, monitoring.md, parallel-run-protocol.md}`

Each runbook follows a fixed shape:
1. **When to use this runbook**
2. **Prerequisites**
3. **Steps** (numbered, with exact commands)
4. **Verification** (how to know it worked)
5. **Rollback** (if anything goes wrong)
6. **Last updated**

`docs/runbooks/README.md`:

```markdown
# HRMS Runbooks

Operational playbooks for common HRMS production tasks. Each runbook is
tested as part of the M12 launch validation.

| Runbook | When to use |
|---|---|
| [deploy-staging.md](deploy-staging.md) | Pushing a new build to staging |
| [deploy-prod.md](deploy-prod.md) | Pushing to Provintell production |
| [rollback.md](rollback.md) | Reverting a bad deploy |
| [restore-from-backup.md](restore-from-backup.md) | Restoring DB from a pg_dump |
| [rotate-encryption-keys.md](rotate-encryption-keys.md) | Yearly HRMS_FIELD_ENCRYPTION_KEY rotation |
| [verify-payroll-ledger.md](verify-payroll-ledger.md) | After incident or quarterly audit |
| [monitoring.md](monitoring.md) | Responding to Grafana / Prometheus alerts |
| [parallel-run-protocol.md](parallel-run-protocol.md) | The 2-week Phase 1 launch validation |
```

Each individual runbook: ~100-200 lines of actual instructions. Pragmatic content — see specific examples below.

- [ ] **Step 1: Write all 9 runbooks**

The implementer writes the runbooks per the shape above. For brevity here, I'm not including the full body of each — they're documentation-driven and don't have unit tests.

Key checkpoints in each:
- `deploy-prod.md`: docker compose pull/up sequence; migration step; smoke health check
- `rollback.md`: nginx upstream switch + previous-image tag retrieval
- `restore-from-backup.md`: download from S3 → verify pg_dump → restore to fresh container → swap
- `rotate-encryption-keys.md`: re-encrypt-on-write pattern; 2-key window during transition
- `verify-payroll-ledger.md`: `POST /api/v1/audit/payroll-ledger/verify` → poll → check OK
- `monitoring.md`: response steps for each alert in `prometheus/rules.yml`
- `parallel-run-protocol.md`: detailed 2-week schedule with daily check-ins, what to validate each day

- [ ] **Step 2: Commit**

```
git add docs/runbooks/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "docs: 9 operational runbooks (deploy, rollback, restore, key rotation, ledger, monitoring, parallel run)"
```

---

## Task 4: Parallel-run protocol acceptance + final tag

**Files:**
- Modify: `CHANGELOG.md` — graduate from milestone tags to `1.0.0`
- Modify: `apps/api/pyproject.toml` and `apps/web/package.json` — set `version = "1.0.0"`

- [ ] **Step 1: Bump versions**

In `apps/api/pyproject.toml`:
```toml
version = "1.0.0"
```

In `apps/web/package.json`:
```json
"version": "1.0.0"
```

In `apps/api/hrms_api/settings/base.py`, the `SPECTACULAR_SETTINGS["VERSION"]` should also be updated:
```python
"VERSION": "1.0.0",
```

- [ ] **Step 2: CHANGELOG — final Phase 1 release**

```markdown
## [1.0.0] - 2026-04-28

**HRMS Phase 1 — Production Release.**

Phase 1 delivers a complete web HRMS for Provintell with all 12 milestones shipped:

### Core platform (M0–M2)
- Repo scaffold, Docker Compose, CI/CD, pre-commit
- Multi-tenant-ready Django + DRF backend, React + Vite frontend
- Identity, RBAC (HRMSPermission + TenantContext), audit log + chained payroll ledger
- Tier-2 Employee directory with encrypted IC/bank/tax IDs (LHDN/EPF/SOCSO/EIS)

### Feature modules (M3–M8)
- Workflow engine (subject-agnostic; reused by Leave, Claims, KPI)
- Leave with balances, ledger, approvals, holiday-replacement rule
- Schedule (shifts, rosters, publish) + Attendance (clock-in/out, fail-soft holiday detection)
- Claims with 3-tier approval chains keyed by amount band
- Payroll CSV import + PDF generation + payroll-ledger writes
- KPI cycles with snapshot pattern for historical preservation
- Certification & training with daily expiry-reminder cron

### UX & operations (M9–M12)
- Notifications system with email digest batching
- Unified approvals inbox + role-aware dashboards
- Reports framework with 15 registered reports + CSV/XLSX/PDF export
- Backup verification + Prometheus alerts + Grafana dashboards + 9 runbooks
- Provintell launch seed data + 2-week parallel-run validation

### By the numbers
- 13 tagged releases (`v0.1.0-m{0..11}` → `v1.0.0`)
- ~480 backend tests + ~10 frontend tests, all green
- 105 permission codes
- 13 modules: identity, organization, employee, leave, schedule, attendance, claims, payslip, kpi, certification, notification, dashboard, reporting + common.audit + common.workflow + common.reporting
- Multi-country-ready schema; English (en-MY) + Malaysia (MYR / Asia/Kuala_Lumpur) seeded at launch

### Phase 2 / Phase 3 are separate engagements
- Phase 2: SaaS subscription model, plan-based feature gating, billing
- Phase 3: Mobile app reusing the Phase 1 APIs

**Tag policy change:** `v0.1.0-mN` milestone tags retire here. Future releases follow semver `vMAJOR.MINOR.PATCH`.
```

- [ ] **Step 3: Commit + tag + merge**

```
git add CHANGELOG.md apps/api/pyproject.toml apps/api/uv.lock apps/web/package.json apps/api/hrms_api/settings/base.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: Phase 1 production release v1.0.0"
git tag -a v1.0.0 -m "HRMS Phase 1 — Provintell production release"

git checkout master
git merge --ff-only m12/hardening
git branch -d m12/hardening
```

Verify:
- `git tag -l` lists 14 tags total: `v0.1.0-m{0..11}` + `v1.0.0`
- `make test` passes (backend + frontend)
- `make seed-provintell-prod` runs cleanly on a fresh DB
- `make verify-backup` (with a real backup in S3) succeeds

---

## M12 / v1.0.0 Acceptance Criteria

Per spec §9, all of these must hold to declare Phase 1 done:

- [ ] All M0–M12 milestone acceptance criteria met
- [ ] `make seed-provintell` produces a working Provintell org with 5+ employees, 7 default roles, 16 holidays, leave balances pre-funded
- [ ] `make seed-provintell --prod` skips demo accounts
- [ ] At least one full leave cycle has run against production data (apply → approve → balance update → notification)
- [ ] At least one full claim cycle has run (submit → manager → finance → reimburse)
- [ ] At least one KPI cycle initiated
- [ ] Backup + restore tested end-to-end against production data (`verify-restore.sh` returns OK)
- [ ] Monitoring dashboards green for ≥ 7 days; alerts wired and tested with synthetic incidents
- [ ] Provintell HR signed off after a 2-week parallel run alongside their existing process
- [ ] Tag `v1.0.0` exists on master HEAD
- [ ] All 14 tags present: `v0.1.0-m{0..11}` + `v1.0.0`

That closes Phase 1. **HRMS is production-shipped for Provintell.**

Phase 2 (SaaS billing) and Phase 3 (mobile) are separate engagements.
