# HRMS Runbooks

Operational playbooks for common HRMS production tasks. Each runbook is
tested as part of the M12 launch validation.

**Owner:** Provintell cyberlab / HRMS ops team
**Last validated:** 2026-04-28

## Index

| Runbook | When to use |
|---|---|
| [deploy-staging.md](deploy-staging.md) | Pushing a new build to staging |
| [deploy-prod.md](deploy-prod.md) | Pushing to Provintell production |
| [rollback.md](rollback.md) | Reverting a bad deploy |
| [restore-from-backup.md](restore-from-backup.md) | Restoring DB from a pg_dump |
| [rotate-encryption-keys.md](rotate-encryption-keys.md) | Yearly `HRMS_FIELD_ENCRYPTION_KEY` rotation |
| [verify-payroll-ledger.md](verify-payroll-ledger.md) | After incident or quarterly audit |
| [monitoring.md](monitoring.md) | Responding to Grafana / Prometheus alerts |
| [parallel-run-protocol.md](parallel-run-protocol.md) | The 2-week Phase 1 launch validation |

## Runbook shape

Every runbook in this directory follows the same fixed shape:

1. **When to use this runbook** — triggers, preconditions
2. **Prerequisites** — credentials, access, tools
3. **Steps** — numbered, with exact commands
4. **Verification** — how to confirm success
5. **Rollback** — what to do if something goes wrong
6. **Last updated**

## Quick reference

```bash
# Check system health
curl -sf http://api:8000/health/ready | python3 -m json.tool

# Tail API logs
docker compose -f deploy/docker-compose.yml logs -f api

# Run migrations (inside container)
docker compose -f deploy/docker-compose.yml exec api uv run python manage.py migrate

# Seed Provintell data (dev)
make seed-provintell

# Verify backup
make verify-backup
```
