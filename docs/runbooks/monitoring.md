# Runbook: Monitoring & Alert Response

## When to use this runbook

Reference this runbook when a Prometheus/Grafana alert fires. Each section
below corresponds to one alert rule in `deploy/prometheus/rules.yml`.

## Alert response steps

---

### APIHighErrorRate

**Trigger:** 5xx error rate > 1% for 5 minutes (severity: page)

**Immediate steps:**
1. Open the HRMS API Health Grafana dashboard
2. Check which endpoints are generating 5xx:
   ```bash
   docker compose -f deploy/docker-compose.yml logs --since 10m api | grep '"status": 5'
   ```
3. Check if it's a single endpoint or system-wide
4. If system-wide, check DB connectivity:
   ```bash
   curl -sf http://localhost:8000/health/ready | python3 -m json.tool
   ```
5. If health check fails, consider rollback: see [rollback.md](rollback.md)
6. If single endpoint, create a bug ticket; consider feature flag if available

---

### APIHighP95Latency

**Trigger:** P95 latency > 1 second for 10 minutes (severity: warn)

**Immediate steps:**
1. Check Grafana HRMS Database dashboard for slow queries or connection pool saturation
2. Check Celery queue depth (CeleryQueueDeep alert may be co-occurring)
3. Check for slow N+1 queries:
   ```bash
   docker compose -f deploy/docker-compose.yml exec db \
       psql -U hrms -d hrms -c \
       "SELECT query, calls, total_exec_time/calls AS avg_ms
        FROM pg_stat_statements ORDER BY avg_ms DESC LIMIT 10;"
   ```
4. If cause is identified and non-critical, schedule fix for next release

---

### DBConnPoolNearSaturation

**Trigger:** DB connections > 80% of `max_connections` for 5 minutes (severity: warn)

**Immediate steps:**
1. Check the Database Grafana dashboard
2. List active connections:
   ```bash
   docker compose -f deploy/docker-compose.yml exec db \
       psql -U hrms -d hrms -c \
       "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
   ```
3. Check for long-running idle connections:
   ```bash
   docker compose -f deploy/docker-compose.yml exec db \
       psql -U hrms -d hrms -c \
       "SELECT pid, state, query_start, query
        FROM pg_stat_activity
        WHERE state != 'idle' AND query_start < now() - interval '5 minutes';"
   ```
4. If idle connections are accumulating, consider restarting the worker/api containers
5. Long-term fix: tune `CONN_MAX_AGE` in Django settings or add pgBouncer

---

### CeleryQueueDeep / CeleryQueueVeryDeep

**Trigger (warn):** queue > 1000 tasks for 5 min | **(page):** queue > 10000 for 1 min

**Immediate steps:**
1. Check Celery Grafana dashboard for task throughput
2. Check worker health:
   ```bash
   docker compose -f deploy/docker-compose.yml logs --since 5m worker
   ```
3. Check if workers are alive:
   ```bash
   docker compose -f deploy/docker-compose.yml exec api \
       uv run celery -A hrms_api inspect ping
   ```
4. If workers are down, restart:
   ```bash
   docker compose -f deploy/docker-compose.yml restart worker
   ```
5. If workers are alive but slow, check for a stuck task:
   ```bash
   docker compose -f deploy/docker-compose.yml exec api \
       uv run celery -A hrms_api inspect active
   ```
6. Scale workers if needed (add more worker replicas)

---

### FailedLoginBruteForce

**Trigger:** Failed login rate > 50/min for 1 minute (severity: page)

**Immediate steps:**
1. Identify the source IP:
   ```bash
   docker compose -f deploy/docker-compose.yml logs --since 5m api \
       | grep "401\|failed_login" | awk '{print $NF}' | sort | uniq -c | sort -rn | head
   ```
2. Block the IP via nginx or firewall:
   ```bash
   # nginx upstream deny (edit nginx config and reload)
   # Or via iptables:
   iptables -I INPUT -s <attacker-ip> -j DROP
   ```
3. Notify Provintell IT security
4. Check if any account was successfully compromised (audit_log table)
5. If account compromise suspected, force-logout all sessions for that user via Django admin

---

### PayrollLedgerVerifyFail

**Trigger:** `hrms_payroll_ledger_verify_status != 1` for 1 minute (severity: page)

**Immediate steps:**
1. Run manual ledger verification immediately:
   ```bash
   curl -sf -X POST -H "Authorization: Bearer <token>" \
       http://localhost:8000/api/v1/audit/payroll-ledger/verify | python3 -m json.tool
   ```
2. Follow the full procedure in [verify-payroll-ledger.md](verify-payroll-ledger.md)
3. **Do not run payroll** until the chain is verified intact
4. Escalate to management if tampering is suspected

---

### BackupJobFailed

**Trigger:** No successful backup in 24 hours (severity: page)

**Immediate steps:**
1. Check the backup cron job status:
   ```bash
   # On the production host cron
   crontab -l | grep pgdump
   # Check cron logs
   grep nightly-pgdump /var/log/syslog | tail -20
   ```
2. Run the backup manually:
   ```bash
   DATABASE_URL="$DATABASE_URL" bash deploy/backups/nightly-pgdump.sh
   ```
3. Check S3 credentials are still valid
4. If S3 is unreachable, create a local dump and alert Provintell IT

---

### DiskUsageHigh / DiskUsageCritical

**Trigger (warn):** disk > 80% | **(critical):** disk > 95%

**Immediate steps:**
1. Check disk usage breakdown:
   ```bash
   df -h /
   du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -10
   du -sh /var/backups/hrms/* 2>/dev/null | sort -rh | head -5
   ```
2. Clean up old Docker images:
   ```bash
   docker image prune -f
   docker volume prune -f
   ```
3. Verify local backup retention is working (should keep only 7 days):
   ```bash
   ls -lh /var/backups/hrms/
   ```
4. If database data directory is large, vacuum:
   ```bash
   docker compose -f deploy/docker-compose.yml exec db \
       psql -U hrms -d hrms -c "VACUUM ANALYZE;"
   ```
5. If critical (>95%), immediately free space or expand the volume

## Last updated

2026-04-28 — M12 initial release
