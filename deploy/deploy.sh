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

echo "== 1/6 snapshot ==" >&2
SNAP="$(deploy/backup.sh predeploy | tail -1)"

echo "== 2/6 checkout $REF ==" >&2
git fetch --tags --quiet
git checkout --quiet "$REF"

echo "== 3/6 build + up (runs migrate on api start) ==" >&2
prod build
prod up -d

echo "== 4/6 smoke ==" >&2
if smoke_check; then
  # Permission codes live in fixtures, not migrations, so `migrate` alone never
  # creates them — and `seed_default_roles` is deliberately create-if-absent, so
  # it will not add new codes to roles that already exist. Without these two
  # commands a release that introduces a permission ships a capability nobody
  # can use: v1.84.0 added the shift-swap perms and every role, org_admin
  # included, silently had no swap button.
  #
  # Runs after smoke so the API is known up and migrations are done. Both are
  # idempotent and add-only (grant_default_perms never removes a perm, and
  # never touches admin-created custom roles), so they are safe on every
  # deploy, including releases that add no permissions at all.
  #
  # A failure here exits non-zero WITHOUT rolling back: the app is already
  # verified healthy, and reverting a good deploy over a permission backfill
  # would be the worse outcome. Re-run both commands by hand.
  echo "== 5/6 seed permission catalogue + backfill role grants ==" >&2
  prod exec -T api uv run python manage.py seed_permission_catalogue
  prod exec -T api uv run python manage.py grant_default_perms

  echo "== 6/6 deployed $REF ==" >&2
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
