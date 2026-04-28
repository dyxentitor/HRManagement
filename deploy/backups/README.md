# HRMS Backup Scripts

Two scripts handle nightly database backups and weekly restore verification.

## Scripts

| Script | Purpose | Cron |
|---|---|---|
| `nightly-pgdump.sh` | pg_dump → gzip → S3 upload | `0 2 * * *` |
| `verify-restore.sh` | Pull latest dump, restore in throwaway container, smoke-test | `0 4 * * 0` |

## Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://hrms:<password>@db:5432/hrms` |  <!-- pragma: allowlist secret -->
| `S3_BUCKET` | Bucket name | `hrms` |
| `S3_BACKUP_PREFIX` | Key prefix (default: `backups/postgres`) | `backups/postgres` |
| `S3_ENDPOINT_URL` | Custom endpoint for MinIO (optional) | `http://minio:9000` |
| `AWS_ACCESS_KEY_ID` | S3 / MinIO access key | |
| `AWS_SECRET_ACCESS_KEY` | S3 / MinIO secret key | |
| `DUMP_DIR` | Local staging dir (default: `/var/backups/hrms`) | `/var/backups/hrms` |

## Manual run (nightly dump)

```bash
export DATABASE_URL="postgres://hrms:<db-password>@localhost:5432/hrms"
export S3_BUCKET=hrms
export S3_ENDPOINT_URL=http://localhost:9000
export AWS_ACCESS_KEY_ID=<minio-access-key>
export AWS_SECRET_ACCESS_KEY=<minio-secret-key>

bash deploy/backups/nightly-pgdump.sh
```

## Manual run (verify restore)

```bash
# same env vars as above, plus Docker must be running
bash deploy/backups/verify-restore.sh
# or via Make:
make verify-backup
```

## Retention policy

- Local: last 7 days (older `.sql.gz` files deleted by `nightly-pgdump.sh`)
- S3: configure bucket lifecycle rules for 30-day retention + Glacier archival at 90 days
