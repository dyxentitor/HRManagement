# Runbook: Rotate Field Encryption Keys

## When to use this runbook

Use annually, or immediately after a suspected key compromise.
HRMS encrypts sensitive employee fields (IC number, bank account, tax IDs) using
`HRMS_FIELD_ENCRYPTION_KEY` (Fernet symmetric key). Rotation uses a 2-key window:
the new key encrypts writes; the old key remains readable until all rows are
re-encrypted and then removed.

## Prerequisites

- SSH access to production host
- Access to the secrets store (Vault, AWS Secrets Manager, or `.env`)
- A maintenance window (rotation itself is online, but safest off-hours)
- The current key value (to keep as `HRMS_FIELD_ENCRYPTION_PREV_KEY`)

## Steps

### 1. Generate a new Fernet key

```bash
# On any machine with Python + cryptography installed
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Save the output — this becomes `HRMS_FIELD_ENCRYPTION_KEY`.

### 2. Update the environment: open the 2-key window

Set **both** keys so the application can read old ciphertext AND write with the new key:

```bash
# In production .env or secrets store:
HRMS_FIELD_ENCRYPTION_KEY=<new-key>           # encrypts all new writes
HRMS_FIELD_ENCRYPTION_PREV_KEY=<old-key>      # still used to decrypt existing ciphertext
```

Restart the application stack:

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml up -d --force-recreate api worker beat
```

Verify health:

```bash
curl -sf http://localhost:8000/health/ready | python3 -m json.tool
```

### 3. Re-encrypt all existing rows (re-encrypt-on-write pattern)

Run the re-encryption management command:

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    exec api uv run python manage.py reencrypt_sensitive_fields \
    --batch-size 100 --dry-run
```

Review output — it should list affected models and row counts. Then run for real:

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    exec api uv run python manage.py reencrypt_sensitive_fields \
    --batch-size 100
```

This reads each encrypted field with the old key and writes it back with the new key.
The command is idempotent: safe to re-run if interrupted.

### 4. Verify re-encryption complete

```bash
# Should return 0 rows still encrypted with the old key
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
    exec api uv run python manage.py reencrypt_sensitive_fields \
    --audit-only
```

### 5. Close the 2-key window: remove old key

Once all rows are re-encrypted:

```bash
# Remove HRMS_FIELD_ENCRYPTION_PREV_KEY from secrets store / .env
# Then restart:
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml up -d --force-recreate api worker beat
```

### 6. Verify no decryption errors

```bash
# Fetch an employee's sensitive fields via API to confirm new key works
curl -sf -H "Authorization: Bearer <token>" \
    http://localhost:8000/api/v1/employees/<id>/ | python3 -m json.tool

docker compose -f deploy/docker-compose.yml logs --since 5m api | grep -i error
```

No errors should appear.

## Verification

- Application starts cleanly with only the new key
- Sensitive employee fields are readable via the API
- No decryption errors in the API logs

## Rollback

If the new key causes decryption failures:

1. Restore `HRMS_FIELD_ENCRYPTION_PREV_KEY` and `HRMS_FIELD_ENCRYPTION_KEY` to original values
2. Restart the stack
3. Investigate which rows failed re-encryption and re-run step 3

## Last updated

2026-04-28 — M12 initial release
