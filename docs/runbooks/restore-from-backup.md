# Runbook: Restore Database from Backup

## When to use this runbook

Use when:
- The production database is corrupted or lost
- A failed migration left the DB in an inconsistent state
- A rollback requires reverting data changes (not just code)
- Disaster recovery drill

## Prerequisites

- SSH access to production host
- Docker installed
- S3 / MinIO credentials with read access to the backup bucket
- `DATABASE_URL` for the production postgres
- Approximately 2x the database size as free disk space

## Steps

### 1. Announce downtime

```
[INCIDENT] HRMS entering database restore mode. ETA: ~30 min. All users offline.
```

Stop the application stack first to prevent writes during restore:

```bash
ssh hrms-prod
cd /opt/hrms

docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    stop api worker beat web
```

### 2. List available backups

```bash
aws s3 ls "s3://${S3_BUCKET}/backups/postgres/" \
    --endpoint-url "${S3_ENDPOINT_URL}" \
    | sort | tail -10
```

Note the filename to restore (e.g. `hrms-20260427-020001.sql.gz`).

### 3. Download the backup

```bash
BACKUP_FILE="hrms-20260427-020001.sql.gz"  # substitute target file

aws s3 cp "s3://${S3_BUCKET}/backups/postgres/$BACKUP_FILE" \
    /tmp/restore.sql.gz \
    --endpoint-url "${S3_ENDPOINT_URL}"

ls -lh /tmp/restore.sql.gz
```

### 4. Drop and recreate the database

```bash
# Connect to postgres container and recreate the database
docker compose -f deploy/docker-compose.yml exec db \
    psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='hrms' AND pid <> pg_backend_pid();"

docker compose -f deploy/docker-compose.yml exec db \
    psql -U postgres -c "DROP DATABASE IF EXISTS hrms;"

docker compose -f deploy/docker-compose.yml exec db \
    psql -U postgres -c "CREATE DATABASE hrms OWNER hrms;"
```

### 5. Restore the dump

```bash
gunzip -c /tmp/restore.sql.gz \
    | docker compose -f deploy/docker-compose.yml exec -T db \
        psql -U hrms -d hrms
```

This will take 1–5 minutes depending on database size. Wait for the prompt to return.

### 6. Verify the restore

```bash
docker compose -f deploy/docker-compose.yml exec db \
    psql -U hrms -d hrms -c \
    "SELECT count(*) AS employees FROM employee_employee WHERE deleted_at IS NULL;"

docker compose -f deploy/docker-compose.yml exec db \
    psql -U hrms -d hrms -c \
    "SELECT seq, row_hash FROM payroll_audit_ledger ORDER BY seq DESC LIMIT 3;"
```

Employee count should be non-zero. Hash chain head should match the value from before the incident.

### 7. Run any post-restore migrations (if needed)

If the backup is older than the current codebase, run migrations to bring it up to date:

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    run --rm api uv run python manage.py migrate
```

### 8. Start the application stack

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml up -d
```

### 9. End-to-end smoke test

```bash
curl -sf http://localhost:8000/health/ready | python3 -m json.tool
```

Log in with a real Provintell user account and verify the dashboard loads.

### 10. Clean up

```bash
rm -f /tmp/restore.sql.gz
```

## Verification

- `/health/ready` returns HTTP 200 with `"status": "ok"`
- Employee count matches expected headcount
- Payroll ledger hash chain head matches pre-incident snapshot (if applicable)

## Rollback (if restore fails)

If the restore itself fails:
1. Try an earlier backup (step 2, pick an older file)
2. Contact Provintell IT lead immediately
3. Preserve all logs for incident postmortem

## Last updated

2026-04-28 — M12 initial release
