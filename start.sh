#!/usr/bin/env bash
# HRMS startup — bring everything you need up after a PC restart.
#
# What this does:
#   1. Makes sure the Docker daemon is running (starts it if not).
#   2. Brings up the full HRMS stack (postgres, redis, minio, mailhog,
#      api, worker, beat, web) via deploy/docker-compose.yml.
#   3. Waits for the API and the web dev server to be reachable.
#   4. Prints the URLs and demo logins.
#
# Idempotent: safe to re-run any time. Doesn't touch your data.
#
# Usage:
#   ./start.sh                # bring everything up
#   ./start.sh stop           # bring everything down (data persists)
#   ./start.sh restart        # down then up
#   ./start.sh logs api       # tail logs for one service
#   ./start.sh status         # show what's running

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.yml"
# Compose v2 looks for .env next to the compose file by default. Our .env
# lives at the repo root, so make the path explicit. Without this, compose
# would fail at HRMS_FIELD_ENCRYPTION_KEY resolution (the :? guard in the
# compose file requires the var to be set; no silent fallback).
ENV_FILE="$REPO_ROOT/.env"

# ----- pretty logging -----
log()  { printf "\033[1;34m[start]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ok]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[err]\033[0m %s\n" "$*" >&2; }

# ----- docker wrapper -----
# If the user isn't in the docker group, fall back to `sg docker -c '...'`.
if docker ps >/dev/null 2>&1; then
    DOCKER="docker"
    SG_PREFIX=""
else
    if id -nG | tr ' ' '\n' | grep -qx docker; then
        DOCKER="docker"
        SG_PREFIX=""
    else
        DOCKER="sg docker -c"
        SG_PREFIX="sg docker -c "
    fi
fi

run_docker() {
    if [[ -z "$SG_PREFIX" ]]; then
        docker "$@"
    else
        sg docker -c "docker $*"
    fi
}

run_compose() {
    if [[ -z "$SG_PREFIX" ]]; then
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
    else
        # quote everything so the inner shell sees the args correctly
        local quoted=""
        for arg in "$@"; do
            quoted+=" $(printf '%q' "$arg")"
        done
        sg docker -c "docker compose --env-file $ENV_FILE -f $COMPOSE_FILE$quoted"
    fi
}

cmd="${1:-up}"

case "$cmd" in
    stop|down)
        log "Stopping the stack (data is preserved)…"
        run_compose down
        ok "Stack stopped."
        exit 0
        ;;
    restart)
        log "Restarting the stack…"
        run_compose down
        # fall through to default (up)
        cmd="up"
        ;;
    logs)
        shift || true
        run_compose logs -f "${@:-api web}"
        exit 0
        ;;
    status|ps)
        run_compose ps
        exit 0
        ;;
    up|start|"")
        cmd="up"
        ;;
    *)
        echo "Unknown command: $cmd"
        echo "Usage: $0 [up|stop|restart|logs <svc>|status]"
        exit 2
        ;;
esac

# ----- 1. Docker daemon -----
log "Checking Docker daemon…"
if ! systemctl is-active --quiet docker 2>/dev/null; then
    if command -v systemctl >/dev/null 2>&1; then
        warn "Docker isn't running. Trying: sudo systemctl start docker"
        sudo systemctl start docker || {
            err "Could not start Docker. Try: sudo systemctl start docker"
            exit 1
        }
        # give it a moment to settle
        sleep 2
    else
        err "Docker daemon doesn't appear to be running and I can't start it (no systemctl)."
        exit 1
    fi
fi
if ! run_docker ps >/dev/null 2>&1; then
    err "Docker daemon isn't responding. Try: sudo systemctl restart docker"
    exit 1
fi
ok "Docker is up."

# ----- 2. Bring up stack -----
log "Bringing up the HRMS stack (this may take 30–90 s on first run)…"
run_compose up -d
ok "Containers requested. Waiting for them to be healthy…"

# ----- 3. Wait for API readiness -----
log "Waiting for API at http://localhost:8000/health/ready (up to 3 min)…"
api_ok=0
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/health/ready >/dev/null 2>&1; then
        api_ok=1
        break
    fi
    sleep 3
done
if [[ "$api_ok" -ne 1 ]]; then
    err "API didn't come up in time. Check: ./start.sh logs api"
    run_compose ps
    exit 1
fi
ok "API ready."

# ----- 4. Wait for web dev server -----
log "Waiting for web dev server at http://localhost:5173/ (up to 3 min)…"
log "(First run after a code change reinstalls deps — can take 30–60 s.)"
web_ok=0
for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ || echo "000")
    if [[ "$code" == "200" ]]; then
        # also probe a real module to catch transform crashes
        mcode=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173/src/main.tsx?t=$(date +%s%N)" || echo "000")
        if [[ "$mcode" == "200" ]]; then
            web_ok=1
            break
        fi
    fi
    sleep 3
done
if [[ "$web_ok" -ne 1 ]]; then
    err "Web server didn't come up cleanly. Check: ./start.sh logs web"
    run_compose ps
    exit 1
fi
ok "Web dev server ready."

# ----- 5. Final report -----
echo
ok "HRMS is up. ✨"
cat <<EOF

  Web UI:        http://localhost:5173/
  API:           http://localhost:8000/
  API docs:      http://localhost:8000/api/v1/docs/
  MailHog:       http://localhost:8025/
  MinIO console: http://localhost:9001/  (login: hrms / hrms-dev-secret)

  Demo logins (password for all: Demo!2026):
    admin@provintell.demo       — Org Admin (full access)
    hr@provintell.demo          — HR Manager
    finance@provintell.demo     — Finance
    ops.lead@provintell.demo    — Manager (Ops, real Employee record)
    eng.lead@provintell.demo    — Manager (Eng, real Employee record)

  Useful:
    ./start.sh status         — what's running
    ./start.sh logs api       — tail one service's logs
    ./start.sh stop           — shut everything down (keeps data)
    ./start.sh restart        — full restart

EOF
