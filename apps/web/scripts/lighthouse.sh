#!/usr/bin/env bash
# Run Lighthouse a11y audit against the dev server for each signature page.
#
# Pre-req: dev server must be running (cd apps/web && pnpm dev) and accessible
# at http://localhost:5173. Lighthouse is run via npx; no global install needed.
#
# Usage:  apps/web/scripts/lighthouse.sh
#         apps/web/scripts/lighthouse.sh --port 4173   # if you preview-built

set -euo pipefail

PORT="${LIGHTHOUSE_PORT:-5173}"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2;;
        *) echo "Unknown arg: $1"; exit 2;;
    esac
done

PAGES=(
    "http://localhost:${PORT}/"
    "http://localhost:${PORT}/employees"
    "http://localhost:${PORT}/leave/me"
    "http://localhost:${PORT}/approvals"
    "http://localhost:${PORT}/me/profile"
)

REPORTS_DIR="$(dirname "$0")/../lighthouse-reports"
mkdir -p "$REPORTS_DIR"

THRESHOLD=95
FAIL=0

for url in "${PAGES[@]}"; do
    name="$(echo "$url" | sed 's|.*//||; s|/|_|g; s|^_||; s|_$||')"
    [ -z "$name" ] && name="root"
    echo "→ auditing $url"
    npx --yes lighthouse "$url" \
        --only-categories=accessibility \
        --output=json,html \
        --output-path="$REPORTS_DIR/$name" \
        --chrome-flags="--headless --no-sandbox" \
        --quiet || {
            echo "    ! lighthouse run failed for $url"
            FAIL=1
            continue
        }
    score=$(node -e "console.log(Math.round(require('$REPORTS_DIR/$name.report.json').categories.accessibility.score * 100))" 2>/dev/null || echo 0)
    echo "    a11y score: $score"
    if [[ "$score" -lt "$THRESHOLD" ]]; then
        echo "    ✗ Below $THRESHOLD — see $REPORTS_DIR/$name.report.html"
        FAIL=1
    fi
done

if [[ "$FAIL" -ne 0 ]]; then
    echo "✗ One or more pages below $THRESHOLD a11y."
    exit 1
fi

echo "✓ All signature pages ≥ $THRESHOLD a11y."
