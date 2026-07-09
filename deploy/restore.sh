#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/prod-env.sh"
SQL_GZ="${1:?usage: restore.sh <backup.sql.gz> [--with-minio]}"
[[ -f "$SQL_GZ" ]] || { echo "FATAL: $SQL_GZ not found" >&2; exit 1; }
echo "Restoring $SQL_GZ into $POSTGRES_DB (drops current data)…" >&2
prod stop api worker beat
prod exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_restore;" \
  -c "CREATE DATABASE ${POSTGRES_DB}_restore OWNER $POSTGRES_USER;"
gunzip -c "$SQL_GZ" | prod exec -T postgres psql -U "$POSTGRES_USER" -d "${POSTGRES_DB}_restore" >/dev/null
# swap: rename live -> old, restore -> live (atomic-ish; requires no active conns)
prod exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "ALTER DATABASE $POSTGRES_DB RENAME TO ${POSTGRES_DB}_old;" \
  -c "ALTER DATABASE ${POSTGRES_DB}_restore RENAME TO $POSTGRES_DB;" \
  -c "DROP DATABASE ${POSTGRES_DB}_old;"
if [[ "${2:-}" == "--with-minio" ]]; then
  TAR="${SQL_GZ%.sql.gz}.minio.tar"
  [[ -f "$TAR" ]] && docker run --rm -v hrms-prod_minio-data:/data -v "$(dirname "$TAR")":/in alpine \
    sh -c "rm -rf /data/* && tar xf /in/$(basename "$TAR") -C /data"
fi
prod restart api worker beat >&2
echo "Restore complete." >&2
