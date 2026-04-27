# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0-m1] - 2026-04-28

### Added
- **M1a — Foundations:** `BaseModel`, `TenantBaseModel`, `EncryptedCharField`, `Money` helpers, RFC 7807 exception handler, `Organization` model + Malaysia country/holidays/leave-type-defaults seed, `Department` tree.
- **M1b-1 — Identity:** Custom `User` model (org-scoped email uniqueness, MFA-ready fields, JSONB preferences/consents), Permission catalogue, Role bundles, UserRole, seed commands for the M1b permission scope and 7 default system roles (`org_admin`, `hr_manager`, `finance`, `manager`, `team_lead`, `employee`, `auditor`).
- **M1b-2 — Auth:** `/api/v1/auth/{login,refresh,logout,me,password/forgot,password/reset,mfa/enable,mfa/confirm,mfa,login/mfa}`. JWT (simplejwt) with refresh-token rotation. TOTP MFA via `pyotp`. Session table tracks issued tokens for server-side revocation.
- **M1b-3 — RBAC:** `HRMSPermission` DRF class, `TenantContextMiddleware`, `OrgService`, Redis-backed permission-set cache with signal invalidation. Organization + Department viewsets are now RBAC-gated.
- **M1b-4 — Audit:** `audit_log` (Tier-1) and `payroll_audit_ledger` (chained, append-only via Postgres trigger) tables. `AuditContextMiddleware` captures actor/ip/ua. Helper API: `from common.audit import append, append_payroll, verify_payroll_chain`. `/api/v1/org/settings` GET/PATCH endpoints.
- **M1c — Frontend Auth:** typed `openapi-fetch` API client with token storage and 401 refresh-retry; `AuthContext` + `useAuth` + `useCan`; login form with MFA challenge step; `<SignedOutGate>` + `<RouteGuard>`; AppShell with TopBar (logout); HomePage showing the signed-in user's email + permission codes.

## [0.1.0-m0] - 2026-04-27

### Added
- M0: Repo scaffold (Docker Compose, CI, pre-commit, OpenAPI contract codegen).
- Django 5 + DRF backend skeleton with split settings (base/dev/test/prod).
- Vite + React + TS + Tailwind frontend skeleton with biome + vitest.
- `packages/contracts` for generated OpenAPI → TypeScript types.
- `make {dev,test,migrate,contracts,lint,build}` targets.
- GitHub Actions CI: api, web, contracts drift, security.
- Pre-commit hooks: ruff, biome, detect-secrets, basic file hygiene.
