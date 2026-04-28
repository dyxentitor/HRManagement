# Runbook: Deploy to Production

## When to use this runbook

Use when promoting a staging-validated build to the Provintell production environment.
**Always deploy to staging first and wait ≥ 1 hour before promoting to prod.**

> **First-time install (greenfield host)?** Use `deploy/bootstrap.sh` instead of this
> runbook — it generates `.env` with fresh secrets, brings up the stack, runs migrations,
> seeds Provintell, and creates the first HR admin in one go. This runbook is for
> *subsequent* releases to an existing host.

## Prerequisites

- Staging deploy green (see [deploy-staging.md](deploy-staging.md))
- Approval from Provintell HR + IT lead (Slack/email sign-off)
- SSH access to the production host
- Production `.env` file populated and verified
- Maintenance window agreed (off-hours recommended for major releases)

## Steps

### 1. Announce maintenance window

Post in the `#hrms-ops` channel:

```
[DEPLOY] Starting HRMS production deploy vX.Y.Z at HH:MM UTC.
Estimated downtime: < 2 minutes (rolling restart).
Rollback window: 30 minutes post-deploy.
```

### 2. SSH to production host

```bash
ssh hrms-prod
cd /opt/hrms
```

### 3. Create a pre-deploy database snapshot

```bash
# Quick dump before deploy (belt-and-suspenders; nightly backup also exists)
bash deploy/backups/nightly-pgdump.sh
```

### 4. Pull the new images

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml pull api web worker beat
```

### 5. Check for pending migrations

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    run --rm api uv run python manage.py migrate --check
```

### 6. Stop the stack

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml down --remove-orphans
```

### 7. Run migrations

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    run --rm api uv run python manage.py migrate
```

### 8. Start the new stack

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml up -d
```

### 9. Warm up + smoke test

```bash
# Wait for readiness (up to 60 s)
for i in $(seq 1 12); do
    curl -sf http://localhost:8000/health/ready && break || sleep 5
done

# Full health check
curl -sf http://localhost:8000/health/ready | python3 -m json.tool
```

### 10. Verify the new version is running

```bash
curl -sf http://localhost:8000/api/v1/docs/ -o /dev/null -w "%{http_code}\n"
# Expect: 200
```

### 11. Post completion notice

```
[DEPLOY COMPLETE] HRMS vX.Y.Z running in production. Monitoring for 30 min.
```

## Verification

- `/health/ready` returns HTTP 200 with `"status": "ok"`, version field shows new tag
- Login + dashboard load for at least one real Provintell user
- No ERROR lines in logs for 5 minutes post-deploy
- Prometheus alerts remain green in Grafana

## Rollback

If anything looks wrong in the first 30 minutes, trigger rollback immediately:

```bash
# Rollback procedure in rollback.md
```

See [rollback.md](rollback.md).

## Last updated

2026-04-28 — M12 initial release
