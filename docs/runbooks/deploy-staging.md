# Runbook: Deploy to Staging

## When to use this runbook

Use this runbook when pushing a new build (code + migrations) to the HRMS staging
environment. Staging is a full mirror of production: same docker compose stack,
same MinIO, real email disabled (MailHog captures outbound).

## Prerequisites

- SSH access to the staging host (or Tailscale)
- Docker and docker compose v2 installed
- Access to the container registry (GHCR or private registry)
- `.env.staging` populated with staging credentials

## Steps

### 1. Pull the latest images

```bash
ssh hrms-staging
cd /opt/hrms

docker compose -f deploy/docker-compose.yml pull api web worker beat
```

### 2. Check for pending migrations

```bash
docker compose -f deploy/docker-compose.yml run --rm api \
    uv run python manage.py migrate --check
```

If the command exits non-zero, migrations are pending — run them in step 4.

### 3. Stop the running stack

```bash
docker compose -f deploy/docker-compose.yml down --remove-orphans
```

### 4. Run migrations

```bash
docker compose -f deploy/docker-compose.yml run --rm api \
    uv run python manage.py migrate
```

### 5. Start the new stack

```bash
docker compose -f deploy/docker-compose.yml up -d
```

### 6. Smoke-test health endpoint

```bash
curl -sf http://localhost:8000/health/ready | python3 -m json.tool
```

Expected output contains `"status": "ok"` with all checks green.

### 7. Tail logs for 2 minutes

```bash
docker compose -f deploy/docker-compose.yml logs -f --since 2m api worker
```

Look for any ERROR / CRITICAL lines. A few startup INFO lines are normal.

## Verification

- `GET /health/ready` returns HTTP 200 with `"status": "ok"`
- `GET /api/v1/docs/` loads the Swagger UI without error
- Login with a test account works end-to-end

## Rollback

If the deploy is bad, roll back to the previous image tag:

```bash
# Find the previous image digest
docker images ghcr.io/provintell/hrms-api --format "{{.Tag}}\t{{.ID}}" | head -5

# Pin previous tag in compose override and redeploy
docker compose -f deploy/docker-compose.yml up -d --no-recreate
```

See [rollback.md](rollback.md) for the full rollback procedure.

## Last updated

2026-04-28 — M12 initial release
