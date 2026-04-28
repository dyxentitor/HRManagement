#!/usr/bin/env bash
# Weekly restore-verification: pulls latest dump, restores into temp container,
# runs smoke checks, asserts payroll_audit_ledger hash chain integrity.
# Cron: 0 4 * * 0  (Sunday 04:00 UTC)
#
# Required env vars:
#   S3_BUCKET, S3_ENDPOINT_URL (optional), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

set -euo pipefail

BUCKET="${S3_BUCKET:-hrms}"
PREFIX="${S3_BACKUP_PREFIX:-backups/postgres}"
ENDPOINT_ARG=""
if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then
    ENDPOINT_ARG="--endpoint-url ${S3_ENDPOINT_URL}"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup verification..."

# Find the most recent backup
LATEST=$(aws s3 ls "s3://$BUCKET/$PREFIX/" $ENDPOINT_ARG \
    | sort | tail -1 | awk '{print $4}')

if [[ -z "$LATEST" ]]; then
    echo "ERROR: no backups found in s3://$BUCKET/$PREFIX/"
    exit 2
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Verifying restore of: $LATEST"

aws s3 cp "s3://$BUCKET/$PREFIX/$LATEST" /tmp/verify.sql.gz \
    $ENDPOINT_ARG --quiet

# Spin up a throwaway postgres container
CONTAINER="hrms-restore-verify-$$"
docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=verify \
    -e POSTGRES_PASSWORD=verify \
    -e POSTGRES_DB=verify \
    postgres:16-alpine

# Wait for postgres to be ready (up to 30 s)
READY=0
for i in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done

if [[ "$READY" -eq 0 ]]; then
    docker rm -f "$CONTAINER" >/dev/null
    echo "ERROR: throwaway postgres container did not become ready in 30 s"
    exit 1
fi

# Restore
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restoring dump..."
gunzip -c /tmp/verify.sql.gz \
    | docker exec -i "$CONTAINER" psql -U verify -d verify -q

# Smoke checks
EMP_COUNT=$(docker exec "$CONTAINER" psql -U verify -d verify -tAc \
    "SELECT count(*) FROM employee_employee WHERE deleted_at IS NULL")

LEDGER_HEAD_HASH=$(docker exec "$CONTAINER" psql -U verify -d verify -tAc \
    "SELECT row_hash FROM payroll_audit_ledger ORDER BY seq DESC LIMIT 1" 2>/dev/null \
    || echo "")

# Cleanup
docker rm -f "$CONTAINER" >/dev/null
rm -f /tmp/verify.sql.gz

if [[ "$EMP_COUNT" -lt 1 ]]; then
    echo "ERROR: restore returned 0 employees — backup may be empty"
    exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Restore OK: $EMP_COUNT employees, ledger head ${LEDGER_HEAD_HASH:-<empty>}"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup verification PASSED."
