#!/usr/bin/env bash
# Nightly object-storage backup — mirror the app bucket (profile photos, claim
# receipts, payroll CSV exports) to a SEPARATE offsite bucket. Pairs with
# nightly-pgdump.sh; a DB restore is useless if the objects it points at are gone.
#
# Schedule via the same mechanism as the pg dump (systemd timer / cron container);
# see deploy/backups/README.md. Suggested: 0 3 * * *.
#
# Required env:
#   S3_BUCKET                 — source bucket (app objects)
#   S3_BACKUP_BUCKET          — destination bucket (offsite / separate account)
# Optional env:
#   S3_ENDPOINT_URL           — source endpoint (MinIO/custom); unset for real S3
#   S3_BACKUP_ENDPOINT_URL    — destination endpoint; unset for real S3
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY               — source creds
#   S3_BACKUP_ACCESS_KEY_ID / S3_BACKUP_SECRET_ACCESS_KEY   — destination creds (if different)
#
# NOTE: keep the destination in a different account/region with versioning +
# object-lock so a compromise or ransomware can't take primary and backup together.

set -euo pipefail

SRC_BUCKET="${S3_BUCKET:?S3_BUCKET (source) must be set}"
DST_BUCKET="${S3_BACKUP_BUCKET:?S3_BACKUP_BUCKET (destination) must be set}"
STAGE="${OBJECT_STAGE_DIR:-/var/backups/hrms/objects}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

src_ep=(); [[ -n "${S3_ENDPOINT_URL:-}" ]] && src_ep=(--endpoint-url "$S3_ENDPOINT_URL")
dst_ep=(); [[ -n "${S3_BACKUP_ENDPOINT_URL:-}" ]] && dst_ep=(--endpoint-url "$S3_BACKUP_ENDPOINT_URL")

mkdir -p "$STAGE"

log "Pulling s3://$SRC_BUCKET -> $STAGE"
aws s3 sync "s3://$SRC_BUCKET" "$STAGE" "${src_ep[@]}" --delete --quiet

# Push to the destination. When source and destination use different creds,
# export the destination creds for this second sync only.
if [[ -n "${S3_BACKUP_ACCESS_KEY_ID:-}" ]]; then
    export AWS_ACCESS_KEY_ID="$S3_BACKUP_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="${S3_BACKUP_SECRET_ACCESS_KEY:?}"
fi

log "Pushing $STAGE -> s3://$DST_BUCKET"
aws s3 sync "$STAGE" "s3://$DST_BUCKET" "${dst_ep[@]}" --quiet

log "Object-storage backup complete."
