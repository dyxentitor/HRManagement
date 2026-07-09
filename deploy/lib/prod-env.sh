#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"
[[ -f "$ENV_FILE" ]] || { echo "FATAL: $ENV_FILE not found" >&2; exit 1; }
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
PROD_CMD=(docker compose --env-file "$ENV_FILE"
  -f "$REPO_ROOT/deploy/docker-compose.yml"
  -f "$REPO_ROOT/deploy/docker-compose.prod.yml" -p hrms-prod)
prod() { "${PROD_CMD[@]}" "$@"; }
