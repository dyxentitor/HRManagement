#!/usr/bin/env bash
smoke_check() {
  local base="${1:-https://localhost}" tries=20
  for _ in $(seq "$tries"); do
    if curl -fsk "$base/healthz" >/dev/null \
       && curl -fsk "$base/health/ready" | grep -q '"status": *"ready"' \
       && curl -fsk "$base/" | grep -q 'id="root"'; then
      echo "smoke: OK" >&2; return 0
    fi
    sleep 3
  done
  echo "smoke: FAILED after ${tries} tries" >&2; return 1
}
