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

## Configure SMTP

HRMS uses Django's email backend for password-reset links, MFA notifications, and
payslip distribution. In dev the stack sends through MailHog (no real mail); in
production you must point it at a real SMTP relay.

### Environment variables

| Variable | Description | Example |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (587 = STARTTLS, 465 = SSL) | `587` |
| `SMTP_USER` | SMTP login username | `hrms@provintell.com` |
| `SMTP_PASSWORD` | SMTP password or app-password | *(see vault)* |
| `SMTP_USE_TLS` | Set `1` to enable STARTTLS | `1` |
| `DEFAULT_FROM_EMAIL` | Envelope From address shown to recipients | `hrms@provintell.com` |

Set these in `/opt/hrms/.env` on the production host before step 8 (start stack).

### Verify SMTP from inside the container

After the stack is running, send a test email to confirm delivery:

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    exec api uv run python manage.py sendtestemail admin@provintell.com
```

Check that the email arrives in the `admin@provintell.com` inbox. If it does not
arrive within 2 minutes, check:

1. `SMTP_HOST` / `SMTP_PORT` are reachable from the container (`nc -zv $SMTP_HOST $SMTP_PORT`)
2. `SMTP_USER` and `SMTP_PASSWORD` are correct (try with your email client)
3. For Gmail: use an App Password (not your account password) — see
   https://myaccount.google.com/apppasswords
4. Check Django logs for `SMTPException` or `ConnectionRefusedError`

### MailHog (dev only)

The dev stack runs MailHog at `http://localhost:8025`. All outbound email is
captured there — nothing reaches the internet. Useful for testing password-reset
flows locally without a real SMTP account.

## Last updated

2026-04-29 — v1.2.0 Phase 1 complete
