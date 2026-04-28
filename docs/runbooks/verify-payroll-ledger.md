# Runbook: Verify Payroll Audit Ledger

## When to use this runbook

Use:
- After any incident involving payroll data
- Quarterly audit (required by Provintell finance team)
- Before and after a database restore
- When the `PayrollLedgerVerifyFail` Prometheus alert fires

The `payroll_audit_ledger` table maintains a cryptographic hash chain over all
payslip publish events. Any tampered or missing row will break the chain.

## Prerequisites

- API access (HTTP or exec into the container)
- `org_admin` or `auditor` role (for the HTTP endpoint)
- Or direct DB access for the manual SQL check

## Steps

### Option A: Via API (recommended)

#### 1. Trigger verification

```bash
TOKEN="<your-org-admin-or-auditor-jwt>"

curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    http://localhost:8000/api/v1/audit/payroll-ledger/verify \
    | python3 -m json.tool
```

Expected response:

```json
{
  "status": "ok",
  "rows_checked": 842,
  "head_seq": 842,
  "head_hash": "a3f9...",
  "verified_at": "2026-04-28T09:00:00Z"
}
```

If the chain is broken:

```json
{
  "status": "fail",
  "broken_at_seq": 317,
  "expected_hash": "b1c2...",
  "actual_hash": "d4e5...",
  "detail": "Hash chain broken at seq 317"
}
```

#### 2. Poll for async result (if endpoint is async)

Some deployments may run the verification asynchronously (large ledgers). Poll:

```bash
JOB_ID="<job-id from step 1 response>"

curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/v1/audit/payroll-ledger/verify/$JOB_ID \
    | python3 -m json.tool
```

### Option B: Direct SQL check (emergency / no API access)

```bash
docker compose -f deploy/docker-compose.yml exec db \
    psql -U hrms -d hrms -c "
SELECT
    seq,
    row_hash,
    md5(prev_hash || seq::text || payload::text) AS computed_hash,
    CASE
        WHEN row_hash = md5(prev_hash || seq::text || payload::text) THEN 'OK'
        ELSE 'BROKEN'
    END AS integrity
FROM payroll_audit_ledger
ORDER BY seq
LIMIT 20;
"
```

Look for any row with `integrity = 'BROKEN'`.

### 3. If verification passes

No action needed. Record the `head_hash` and `rows_checked` in the audit log
(copy to finance team's audit spreadsheet for quarterly review).

### 4. If verification fails

Immediately:
1. Page the HRMS ops lead
2. Preserve the current DB state — do NOT run payroll until resolved
3. Identify the `broken_at_seq` value
4. Compare the suspect row against the backup from the night before:

```bash
# Restore the backup to a throwaway container and run the same check
bash deploy/backups/verify-restore.sh
```

5. If the break is recent (< 24h), check the audit_log table for unauthorized changes:

```bash
docker compose -f deploy/docker-compose.yml exec db \
    psql -U hrms -d hrms -c "
SELECT * FROM audit_auditlog
WHERE table_name = 'payroll_audit_ledger'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC LIMIT 20;
"
```

6. Escalate to Provintell management and Malaysian PDPA data breach protocol if tampering
   is confirmed.

## Verification

- API endpoint returns `"status": "ok"`
- `rows_checked` matches the expected number of published payslips
- No ERROR lines in API logs relating to ledger operations

## Rollback

There is no "rollback" for ledger failures — this is an integrity issue, not a
deploy issue. Follow the incident response steps in step 4 above.

## Last updated

2026-04-28 — M12 initial release
