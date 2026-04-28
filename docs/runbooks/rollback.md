# Runbook: Rollback a Bad Deploy

## When to use this runbook

Use when:
- A production deploy introduces a regression (5xx spike, data errors, broken login)
- Health checks fail after deploy
- Grafana alert fires within the 30-minute post-deploy watch window

**Decision threshold:** If 5xx error rate > 1% for > 2 minutes post-deploy, rollback immediately.

## Prerequisites

- SSH access to production host
- The previous image tag (noted before deploy, or discoverable via `docker images`)
- Access to the compose files in `/opt/hrms`

## Steps

### 1. Identify the previous image tag

```bash
ssh hrms-prod
cd /opt/hrms

# List recent API images — second row is the previous tag
docker images ghcr.io/provintell/hrms-api \
    --format "table {{.Tag}}\t{{.CreatedAt}}\t{{.ID}}" | head -5
```

Note the tag of the image that was running before the bad deploy (e.g. `v0.9.1` or a SHA).

### 2. Announce rollback

Post in `#hrms-ops`:

```
[ROLLBACK] Initiating rollback to vPREVIOUS. Estimated < 5 min.
```

### 3. Edit the compose override (pin previous tag)

```bash
# Set HRMS_API_TAG env var to the previous image tag
export HRMS_API_TAG=<previous-tag>
```

Or edit `deploy/docker-compose.prod.yml` temporarily:

```yaml
services:
  api:
    image: ghcr.io/provintell/hrms-api:<previous-tag>
  worker:
    image: ghcr.io/provintell/hrms-api:<previous-tag>
  beat:
    image: ghcr.io/provintell/hrms-api:<previous-tag>
```

### 4. Stop current stack

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml down --remove-orphans
```

### 5. Reverse any forward-only migrations (if applicable)

If the new release added migrations, you must reverse them **before** starting the old image:

```bash
# Find the last migration state of the previous release
# e.g. if new release added leave 0023, reverse to 0022:
docker compose -f deploy/docker-compose.yml run --rm api \
    uv run python manage.py migrate leave 0022
```

> If migrations are backwards-incompatible, restore from backup instead.
> See [restore-from-backup.md](restore-from-backup.md).

### 6. Start with previous image

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml up -d
```

### 7. Smoke test

```bash
curl -sf http://localhost:8000/health/ready | python3 -m json.tool
# Confirm version shows the previous tag
```

### 8. Confirm rollback success

```bash
# Check error rate is back to baseline (< 0.1%)
# Monitor Grafana — HRMS API Health dashboard
```

Post in `#hrms-ops`:

```
[ROLLBACK COMPLETE] Running vPREVIOUS. 5xx rate normal. Investigating root cause.
```

## Verification

- `/health/ready` returns HTTP 200 with previous version
- 5xx error rate returns to baseline (< 0.1%)
- Users can log in and access dashboards

## Rollback of the rollback

If rollback also fails (corrupt DB state), restore from backup:

See [restore-from-backup.md](restore-from-backup.md).

## Last updated

2026-04-28 — M12 initial release
