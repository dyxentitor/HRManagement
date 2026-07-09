#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/lib/prod-env.sh
source deploy/lib/smoke.sh
REF="${1:?usage: deploy.sh <git-tag-or-commit>}"
PREV_REF="$(git rev-parse HEAD)"
migs() { prod exec -T api python manage.py showmigrations --plan 2>/dev/null | grep -c '\[X\]' || echo 0; }

echo "== 1/5 snapshot ==" >&2
SNAP="$(deploy/backup.sh predeploy | tail -1)"
BEFORE="$(migs)"

echo "== 2/5 checkout $REF ==" >&2
git fetch --tags --quiet
git checkout --quiet "$REF"

echo "== 3/5 build + up (runs migrate on api start) ==" >&2
prod build
prod up -d

echo "== 4/5 smoke ==" >&2
if smoke_check; then
  echo "== 5/5 deployed $REF ==" >&2
  exit 0
fi

echo "!! smoke failed — AUTO-ROLLBACK to $PREV_REF" >&2
git checkout --quiet "$PREV_REF"
prod build && prod up -d
AFTER="$(migs)"
if [[ "$AFTER" -ne "$BEFORE" ]]; then
  echo "migration ran ($BEFORE→$AFTER) — restoring snapshot $SNAP" >&2
  deploy/restore.sh "$SNAP"
fi
smoke_check || echo "WARN: still unhealthy after rollback — manual intervention needed" >&2
exit 1
