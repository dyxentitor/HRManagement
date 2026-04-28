#!/usr/bin/env bash
# Nightly Postgres dump — gzip + upload to S3.
# Cron: 0 2 * * *
#
# Required env vars:
#   DATABASE_URL   — postgres connection string
#   S3_BUCKET      — target bucket name (default: hrms)
#   S3_ENDPOINT_URL — (optional) MinIO or custom S3 endpoint
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY — standard AWS creds

set -euo pipefail

TS="$(date -u +%Y%m%d-%H%M%S)"
DUMP_DIR="${DUMP_DIR:-/var/backups/hrms}"
BUCKET="${S3_BUCKET:-hrms}"
PREFIX="${S3_BACKUP_PREFIX:-backups/postgres}"

mkdir -p "$DUMP_DIR"
DUMP_FILE="$DUMP_DIR/hrms-$TS.sql.gz"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting pg_dump..."
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Dump complete: $DUMP_FILE ($DUMP_SIZE)"

# Upload to S3 / MinIO
ENDPOINT_ARG=""
if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then
    ENDPOINT_ARG="--endpoint-url ${S3_ENDPOINT_URL}"
fi

aws s3 cp "$DUMP_FILE" "s3://$BUCKET/$PREFIX/hrms-$TS.sql.gz" \
    $ENDPOINT_ARG \
    --quiet

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploaded: s3://$BUCKET/$PREFIX/hrms-$TS.sql.gz"

# Local retention: keep last 7 days
find "$DUMP_DIR" -name "hrms-*.sql.gz" -mtime +7 -delete

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup complete."
