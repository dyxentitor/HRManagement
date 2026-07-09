#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/prod-env.sh"
LABEL="${1:-manual}"
TS="$(date +%Y%m%d-%H%M%S)"          # runtime stamp — fine in a live script
OUT="$REPO_ROOT/backups"; mkdir -p "$OUT"
DB_FILE="$OUT/${LABEL}-${TS}.sql.gz"
prod exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DB_FILE"
# MinIO objects (volume tar via a throwaway alpine mounting the named volume)
docker run --rm -v hrms-prod_minio-data:/data:ro -v "$OUT":/out alpine \
  tar cf "/out/${LABEL}-${TS}.minio.tar" -C /data . || echo "WARN: minio backup skipped" >&2
# Rotation: keep newest 14 of each kind
ls -1t "$OUT"/*.sql.gz  2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$OUT"/*.minio.tar 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "$DB_FILE"
