#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/lib/prod-env.sh
source deploy/lib/smoke.sh
TARGET="${1:-$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null)}"
[[ -n "$TARGET" ]] || { echo "FATAL: no target ref" >&2; exit 1; }
echo "Rolling back to $TARGET" >&2
git checkout --quiet "$TARGET"
prod build && prod up -d
if [[ "${2:-}" == "--restore-data" ]]; then
  SNAP="$(ls -1t backups/predeploy-*.sql.gz | head -1)"
  echo "Restoring newest snapshot $SNAP" >&2
  deploy/restore.sh "$SNAP"
fi
smoke_check
