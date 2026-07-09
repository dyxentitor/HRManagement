#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/lib/prod-env.sh
source deploy/lib/smoke.sh
REF="${1:?usage: deploy.sh <git-tag-or-commit>}"
PREV_REF="$(git rev-parse HEAD)"

# Deterministic migration detection: check if the forward diff touches any migrations file.
# Done here (before checkout) while both refs are resolvable in git.
MIGRATED=no
if ! git diff --quiet "$PREV_REF" "$REF" -- '*/migrations/*.py'; then
  MIGRATED=yes
fi

echo "== 1/5 snapshot ==" >&2
SNAP="$(deploy/backup.sh predeploy | tail -1)"

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
if [[ "$MIGRATED" == yes ]]; then
  echo "migration ran (git-detected) — restoring snapshot $SNAP" >&2
  deploy/restore.sh "$SNAP" || echo "WARN: snapshot restore failed during rollback — manual DB recovery needed" >&2
fi
smoke_check || echo "WARN: still unhealthy after rollback — manual intervention needed" >&2
exit 1
