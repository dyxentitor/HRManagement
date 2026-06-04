#!/usr/bin/env bash
# HRMS onboarding — one command to take a fresh machine to a running stack.
#
# It will:
#   1. Run a dependency doctor (Docker, Compose v2, daemon, docker group, curl,
#      free ports, disk) and offer to install/fix anything missing.
#   2. Generate a .env at repo root if missing (fresh Fernet key + secrets).
#   3. Bring up the Docker stack and wait for the API.
#   4. Run migrations.
#   5. Seed — your choice: full demo / logins only / nothing.
#   6. Optionally create the first HR admin.
#   7. Verify it actually works (health + web + demo-login smoke).
#
# Idempotent — safe to re-run. An existing .env, migrations, and seed rows are
# preserved.
#
# Usage:
#   deploy/bootstrap.sh [options]
#
# Options:
#   --dev                 Development stack, DEBUG=1 (default).
#   --prod                Production stack (adds docker-compose.prod.yml).
#   --seed=demo|logins|none
#                         demo   = 5 employees + all 7 role logins (default in dev)
#                         logins = roles + 7 logins, no employee records
#                         none   = empty org scaffold (default in prod)
#   --install-deps        Install missing dependencies without asking.
#   --no-install-deps     Never install; only report what's missing.
#   -y, --yes             Assume defaults, no prompts (unattended re-deploy).
#   --dry-run             Run the doctor + print the plan; change nothing.
#   -h, --help            Show this help and exit.
#
# Examples:
#   deploy/bootstrap.sh                         # interactive, dev
#   deploy/bootstrap.sh --dev --seed=demo --yes # unattended dev re-deploy
#   deploy/bootstrap.sh --prod --seed=none      # empty production scaffold

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

#-----------------------------------------------------------------------------
# Defaults + arg parsing
#-----------------------------------------------------------------------------
MODE="dev"
SEED_CHOICE=""          # demo|logins|none ; empty => ask (or default by mode)
INSTALL_DEPS="ask"      # ask|yes|no
ASSUME_YES="0"
DRY_RUN="0"

usage() { sed -n '2,49p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev)              MODE="dev" ;;
        --prod)             MODE="prod" ;;
        --seed=*)           SEED_CHOICE="${1#*=}" ;;
        --seed)             shift; SEED_CHOICE="${1:-}" ;;
        --install-deps)     INSTALL_DEPS="yes" ;;
        --no-install-deps)  INSTALL_DEPS="no" ;;
        -y|--yes)           ASSUME_YES="1" ;;
        --dry-run)          DRY_RUN="1" ;;
        -h|--help)          usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; echo "Try --help." >&2; exit 2 ;;
    esac
    shift
done

case "$SEED_CHOICE" in
    ""|demo|logins|none) ;;
    *) echo "Invalid --seed value: $SEED_CHOICE (use demo|logins|none)" >&2; exit 2 ;;
esac

COMPOSE_BASE=(--env-file .env -f deploy/docker-compose.yml)
if [[ "$MODE" == "prod" ]]; then
    COMPOSE_BASE+=(-f deploy/docker-compose.prod.yml)
fi

#-----------------------------------------------------------------------------
# Pretty logging
#-----------------------------------------------------------------------------
log()  { printf "\033[1;34m[onboard]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; }

# Ask a yes/no question. Auto-yes when --yes. Returns 0 for yes.
confirm() {
    [[ "$ASSUME_YES" == "1" ]] && return 0
    local reply
    read -rp "$1 [y/N] " reply
    [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

#-----------------------------------------------------------------------------
# Docker access wrapper
#
# A freshly-added 'docker' group membership isn't active in the current shell
# until re-login, but `sg docker -c …` reads /etc/group immediately. So if a
# direct `docker` call can't reach the daemon but `sg docker` can, route every
# docker/compose call through sg for this run (same trick start.sh uses).
#-----------------------------------------------------------------------------
DOCKER_SG="0"   # 0 = direct, 1 = via `sg docker -c`, unknown = no access

set_docker_access() {
    if docker ps >/dev/null 2>&1; then DOCKER_SG="0"; return 0; fi
    if sg docker -c "docker ps" >/dev/null 2>&1; then DOCKER_SG="1"; return 0; fi
    DOCKER_SG="unknown"; return 1
}

# `ddocker …` — a raw docker call honouring the sg wrapper.
ddocker() {
    if [[ "$DOCKER_SG" == "1" ]]; then
        local cmd; printf -v cmd '%q ' docker "$@"
        sg docker -c "$cmd"
    else
        docker "$@"
    fi
}

# `dc …` — a `docker compose` call honouring the sg wrapper. Stdin is inherited,
# so heredocs (manage.py shell) work through the wrapper too.
dc() {
    if [[ "$DOCKER_SG" == "1" ]]; then
        local cmd; printf -v cmd '%q ' docker compose "${COMPOSE_BASE[@]}" "$@"
        sg docker -c "$cmd"
    else
        docker compose "${COMPOSE_BASE[@]}" "$@"
    fi
}

#-----------------------------------------------------------------------------
# Dependency doctor
#-----------------------------------------------------------------------------
PKG=""
detect_pkg() {
    if   command -v apt-get >/dev/null 2>&1; then PKG="apt"
    elif command -v dnf     >/dev/null 2>&1; then PKG="dnf"
    elif command -v pacman  >/dev/null 2>&1; then PKG="pacman"
    else PKG=""; fi
}

# install_cmd <docker|compose|curl> -> prints the distro-specific command
install_cmd() {
    case "$1:$PKG" in
        docker:apt)     echo "sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 && sudo systemctl enable --now docker" ;;
        docker:dnf)     echo "sudo dnf install -y docker docker-compose-plugin && sudo systemctl enable --now docker" ;;
        docker:pacman)  echo "sudo pacman -S --noconfirm docker docker-compose && sudo systemctl enable --now docker" ;;
        compose:apt)    echo "sudo apt-get update && sudo apt-get install -y docker-compose-v2" ;;
        compose:dnf)    echo "sudo dnf install -y docker-compose-plugin" ;;
        compose:pacman) echo "sudo pacman -S --noconfirm docker-compose" ;;
        curl:apt)       echo "sudo apt-get install -y curl" ;;
        curl:dnf)       echo "sudo dnf install -y curl" ;;
        curl:pacman)    echo "sudo pacman -S --noconfirm curl" ;;
        *)              echo "# (unknown package manager) install '$1' manually" ;;
    esac
}

# offer "<what is missing>" "<command>"  -> runs it (confirm/auto), or reports.
# Returns 0 if resolved, 1 if left unresolved.
offer() {
    local what="$1" cmd="$2"
    warn "$what"
    printf "       %s\n" "$cmd"
    if [[ "$DRY_RUN" == "1" ]]; then log "(dry-run) would run the above"; return 1; fi
    if [[ "$INSTALL_DEPS" == "no" ]]; then warn "left as-is (--no-install-deps). Run it yourself, then re-run me."; return 1; fi
    local auto=""; [[ "$INSTALL_DEPS" == "yes" ]] && auto="1"
    if [[ "$auto" == "1" ]] || confirm "  Run this now?"; then
        eval "$cmd"
        return 0
    fi
    return 1
}

port_busy() { (echo >"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

check_ports() {
    local busy=() p
    for p in 5432 6379 9000 9001 8000 5173 1025 8025; do
        port_busy "$p" && busy+=("$p")
    done
    if [[ ${#busy[@]} -gt 0 ]]; then
        warn "ports in use: ${busy[*]} — fine if that's our own stack from a previous run; otherwise stop the conflicting service or you'll hit bind errors."
    else
        ok "required ports are free"
    fi
}

check_disk() {
    local dir="/var/lib/docker"; [[ -d "$dir" ]] || dir="$REPO_ROOT"
    local avail
    avail="$(df -Pk "$dir" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}')"
    if [[ -n "$avail" && "$avail" -lt 5 ]]; then
        warn "only ${avail}G free on $dir — images + volumes want a few GB."
    else
        ok "disk space OK (~${avail:-?}G free on $dir)"
    fi
}

doctor() {
    log "Dependency doctor…"
    detect_pkg
    [[ -z "$PKG" ]] && warn "no apt/dnf/pacman detected — install commands are best-effort."

    command -v docker >/dev/null 2>&1 && ok "docker installed" \
        || offer "docker is not installed" "$(install_cmd docker)" || true

    if command -v docker >/dev/null 2>&1; then
        docker compose version >/dev/null 2>&1 && ok "docker compose v2 plugin present" \
            || offer "docker compose v2 plugin missing" "$(install_cmd compose)" || true
    fi

    command -v curl >/dev/null 2>&1 && ok "curl present" \
        || offer "curl missing (used for health + login checks)" "$(install_cmd curl)" || true

    # Daemon
    if ! docker info >/dev/null 2>&1 && ! sg docker -c "docker info" >/dev/null 2>&1; then
        offer "docker daemon not running" "sudo systemctl start docker" || true
        sleep 1
    fi

    # Resolve how we'll talk to docker. Only nag about the docker group if we
    # genuinely can't reach the daemon (direct OR via sg).
    if set_docker_access; then
        [[ "$DOCKER_SG" == "1" ]] && log "group not active in this shell yet — using 'sg docker' for this run (no logout needed)"
        ok "docker daemon reachable"
    else
        if ! id -nG 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
            offer "you ($USER) are not in the 'docker' group" "sudo usermod -aG docker $USER" || true
            set_docker_access || true
        fi
        if [[ "$DOCKER_SG" == "unknown" ]]; then
            err "can't reach the docker daemon."
            err "If you were just added to the 'docker' group, log out and back in (or reboot), then re-run."
            [[ "$DRY_RUN" == "1" ]] || exit 1
        else
            [[ "$DOCKER_SG" == "1" ]] && log "using 'sg docker' for this run (no logout needed)"
            ok "docker daemon reachable"
        fi
    fi

    check_ports
    check_disk
}

#-----------------------------------------------------------------------------
# .env
#-----------------------------------------------------------------------------
# Print a valid Fernet key (urlsafe-base64 of 32 random bytes) with no Python dep.
gen_fernet_key() {
    if command -v python3 >/dev/null 2>&1 && python3 -c "from cryptography.fernet import Fernet" 2>/dev/null; then
        python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
    else
        # Fernet key == base64.urlsafe_b64encode(os.urandom(32)). Reproduce in shell.
        head -c 32 /dev/urandom | base64 | tr '+/' '-_'
    fi
}

ensure_env() {
    if [[ -f .env ]]; then
        local key
        key="$(grep -E '^HRMS_FIELD_ENCRYPTION_KEY=' .env | head -1 | cut -d= -f2-)"
        if [[ -z "$key" ]]; then
            err ".env exists but HRMS_FIELD_ENCRYPTION_KEY is empty."
            err "Set a Fernet key (python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())') and re-run."
            exit 1
        fi
        ok ".env present (key set) — keeping it."
        return
    fi

    log "No .env — generating one with fresh secrets ($MODE mode)."
    local FERNET_KEY SECRET_KEY DB_PASSWORD S3_SECRET
    FERNET_KEY="$(gen_fernet_key)"
    # `tr </dev/urandom | head` makes tr exit 141 (SIGPIPE) when head closes the
    # pipe; under `set -o pipefail` that aborts the script. The value is already
    # complete, so disable pipefail — scoped to each `$(…)` subshell.
    SECRET_KEY="$(set +o pipefail; LC_ALL=C tr -dc 'a-zA-Z0-9!@#$%^&*()_+-=' </dev/urandom | head -c 64)"
    DB_PASSWORD="$(set +o pipefail; LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32)"
    S3_SECRET="$(set +o pipefail; LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32)"

    local DEBUG SETTINGS ALLOWED_HOSTS VITE_API
    if [[ "$MODE" == "prod" ]]; then
        DEBUG=0; SETTINGS=hrms_api.settings.prod; ALLOWED_HOSTS="localhost,api"; VITE_API="/api"
    else
        DEBUG=1; SETTINGS=hrms_api.settings.dev; ALLOWED_HOSTS="localhost,127.0.0.1,api"; VITE_API="http://localhost:8000"
    fi

    cat > .env <<EOF
# Generated by deploy/bootstrap.sh ($MODE mode).
#
# WARNING: HRMS_FIELD_ENCRYPTION_KEY encrypts IC, bank, EPF/SOCSO/EIS, LHDN data.
# Losing it means losing access to those fields forever. Back this file up
# offline (password manager / encrypted USB) before going live.

# === Django ===
DJANGO_SETTINGS_MODULE=$SETTINGS
DJANGO_SECRET_KEY=$SECRET_KEY
DJANGO_DEBUG=$DEBUG
DJANGO_ALLOWED_HOSTS=$ALLOWED_HOSTS

# === Field-level encryption (32-byte url-safe base64) ===
HRMS_FIELD_ENCRYPTION_KEY=$FERNET_KEY

# === Database ===
POSTGRES_USER=hrms
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=hrms
DATABASE_URL=postgres://hrms:$DB_PASSWORD@postgres:5432/hrms

# === Redis ===
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# === Object storage ===
S3_ENDPOINT_URL=http://minio:9000
S3_ACCESS_KEY=hrms
S3_SECRET_KEY=$S3_SECRET
S3_BUCKET=hrms
S3_REGION=us-east-1
S3_USE_SSL=0

# === Email — REPLACE with real SMTP for prod ===
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=0
DEFAULT_FROM_EMAIL=hrms@provintell.local

# === Frontend ===
VITE_API_BASE_URL=$VITE_API
EOF
    chmod 600 .env
    ok ".env written (mode=$MODE)."
    if [[ "$MODE" == "prod" && "$ASSUME_YES" != "1" ]]; then
        warn "Edit .env now: DJANGO_ALLOWED_HOSTS, SMTP_*, DEFAULT_FROM_EMAIL."
        warn "Back up HRMS_FIELD_ENCRYPTION_KEY offline before continuing."
        read -rp "Press Enter when .env is ready, or Ctrl-C to abort..."
    fi
}

#-----------------------------------------------------------------------------
# Seed choice
#-----------------------------------------------------------------------------
choose_seed() {
    [[ -n "$SEED_CHOICE" ]] && return
    if [[ "$ASSUME_YES" == "1" ]]; then
        SEED_CHOICE=$([[ "$MODE" == "prod" ]] && echo none || echo demo); return
    fi
    local def; def=$([[ "$MODE" == "prod" ]] && echo 3 || echo 1)
    echo
    echo "  Seed data?"
    echo "    1) Full demo   (5 employees + all 7 role logins)"
    echo "    2) Logins only (roles + 7 logins, no employee records)"
    echo "    3) Nothing     (empty org scaffold; you add real data)"
    local c; read -rp "  Choose [$def]: " c; c="${c:-$def}"
    case "$c" in
        1) SEED_CHOICE=demo ;;
        2) SEED_CHOICE=logins ;;
        3) SEED_CHOICE=none ;;
        *) warn "unrecognised choice; using default"; SEED_CHOICE=$([[ "$MODE" == "prod" ]] && echo none || echo demo) ;;
    esac
}

seed_flags() {
    case "$SEED_CHOICE" in
        demo)   echo "" ;;
        logins) echo "--no-employees" ;;
        none)   echo "--prod --no-employees" ;;
    esac
}

#-----------------------------------------------------------------------------
# Verification
#-----------------------------------------------------------------------------
ACCOUNTS=(admin hr finance ops.lead eng.lead team.lead employee auditor)

verify() {
    local fail=0
    log "Verifying…"
    if curl -sf http://localhost:8000/health/ready >/dev/null 2>&1; then
        ok "API /health/ready"
    else
        err "API /health/ready failed"; fail=1
    fi

    local web_port; web_port=$([[ "$MODE" == "prod" ]] && echo 80 || echo 5173)
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${web_port}/" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then
        ok "web responding on :$web_port"
    else
        warn "web on :$web_port returned $code (first run can still be installing deps — check: ./start.sh logs web)"
    fi

    if [[ "$SEED_CHOICE" != "none" ]]; then
        log "login smoke (all demo accounts, password Demo!2026)…"
        local e
        for e in "${ACCOUNTS[@]}"; do
            if curl -s -X POST http://localhost:8000/api/v1/auth/login \
                 -H 'Content-Type: application/json' \
                 -d "{\"email\":\"$e@provintell.demo\",\"password\":\"Demo!2026\"}" 2>/dev/null \
                 | grep -q access_token; then
                ok "  $e@provintell.demo"
            else
                err "  $e@provintell.demo FAILED"; fail=1
            fi
        done
    fi
    return $fail
}

#-----------------------------------------------------------------------------
# Main
#-----------------------------------------------------------------------------
echo
log "HRMS onboarding — mode=$MODE${SEED_CHOICE:+, seed=$SEED_CHOICE}$([[ "$ASSUME_YES" == 1 ]] && echo ', unattended')$([[ "$DRY_RUN" == 1 ]] && echo ', dry-run')"

doctor

if [[ "$DRY_RUN" == "1" ]]; then
    choose_seed
    echo
    log "Plan (dry-run — nothing changed):"
    echo "    mode:        $MODE"
    echo "    .env:        $([[ -f .env ]] && echo 'exists (kept)' || echo 'would be generated')"
    echo "    seed:        ${SEED_CHOICE} ($(seed_flags | sed 's/^$/no flags/'))"
    echo "    compose:     docker compose ${COMPOSE_BASE[*]} up -d"
    echo "    verify:      health + web$([[ "$SEED_CHOICE" != none ]] && echo ' + 8-login smoke')"
    exit 0
fi

ensure_env
choose_seed

log "Starting stack (first run builds images — 1–3 min)…"
dc up -d

log "Waiting for the API (up to 5 min)…"
api_ok=0
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/health/ready >/dev/null 2>&1; then api_ok=1; break; fi
    sleep 5
done
if [[ "$api_ok" != "1" ]]; then
    err "API didn't become ready. Check: docker compose ${COMPOSE_BASE[*]} logs api"
    exit 1
fi
ok "API ready."

log "Running migrations…"
dc exec -T api uv run python manage.py migrate --noinput

# shellcheck disable=SC2046  # intentional word-splitting of the flag string
log "Seeding ($SEED_CHOICE)…"
dc exec -T api uv run python manage.py seed_provintell $(seed_flags)

# First admin (skipped when unattended)
if [[ "$ASSUME_YES" != "1" ]]; then
    echo
    log "Create the first HR admin (press Enter to skip — demo admin already exists if you seeded demo/logins)."
    read -rp "  Admin email: " ADMIN_EMAIL
    if [[ -n "$ADMIN_EMAIL" ]]; then
        while :; do
            read -rsp "  Admin password (min 12 chars): " ADMIN_PW; echo
            read -rsp "  Confirm password:            "  ADMIN_PW2; echo
            [[ "$ADMIN_PW" != "$ADMIN_PW2" ]] && { warn "Passwords don't match."; continue; }
            [[ ${#ADMIN_PW} -lt 12 ]] && { warn "Min 12 characters."; continue; }
            break
        done
        log "Creating admin '$ADMIN_EMAIL'…"
        export ADMIN_EMAIL ADMIN_PW
        dc exec -T -e ADMIN_EMAIL -e ADMIN_PW api uv run python manage.py shell <<'PYEOF'
import os
from modules.identity.models import User, Role, UserRole
from modules.organization.models import Organization

email = os.environ["ADMIN_EMAIL"].strip().lower()
password = os.environ["ADMIN_PW"]
org = Organization.objects.get(slug="provintell")
user, created = User.objects.get_or_create(
    email=email, org_id=org.id, defaults={"is_staff": True, "is_active": True},
)
user.is_staff = True
user.is_active = True
user.set_password(password)
user.save()
role = Role.objects.filter(org_id=org.id, code="org_admin").first()
if role and not UserRole.objects.filter(user=user, role=role).exists():
    UserRole.objects.create(user=user, role=role, granted_by=None)
print(f"  -> {'created' if created else 'updated'}: {email}")
PYEOF
        unset ADMIN_PW ADMIN_PW2
    else
        warn "Skipping admin creation."
    fi
fi

# Verify
echo
verify_rc=0
verify || verify_rc=$?

#-----------------------------------------------------------------------------
# Summary
#-----------------------------------------------------------------------------
web_url=$([[ "$MODE" == "prod" ]] && echo "http://localhost/  (prod nginx)" || echo "http://localhost:5173/")
echo
if [[ "$verify_rc" == "0" ]]; then
    ok "Onboarding complete. ✨"
else
    warn "Onboarding finished with verification warnings/failures (see above)."
fi
cat <<EOF

  Web UI:        $web_url
  API:           http://localhost:8000/
  API docs:      http://localhost:8000/api/v1/docs/
  MailHog:       http://localhost:8025/
  MinIO console: http://localhost:9001/   (hrms / hrms-dev-secret)
EOF

if [[ "$SEED_CHOICE" != "none" ]]; then
    cat <<EOF

  Demo logins (password: Demo!2026):
    admin@provintell.demo     org_admin       hr@provintell.demo        hr_manager
    finance@provintell.demo   finance          ops.lead@provintell.demo  manager
    eng.lead@provintell.demo  manager          team.lead@provintell.demo team_lead
    employee@provintell.demo  employee         auditor@provintell.demo   auditor
EOF
fi

cat <<EOF

  ⚠  Back up your encryption key offline (losing it = unrecoverable PII):
       grep '^HRMS_FIELD_ENCRYPTION_KEY=' .env

  Daily ops:  ./start.sh [up|stop|restart|logs <svc>|status]
  Re-run me:  deploy/bootstrap.sh --$MODE${SEED_CHOICE:+ --seed=$SEED_CHOICE}
EOF

exit "$verify_rc"
