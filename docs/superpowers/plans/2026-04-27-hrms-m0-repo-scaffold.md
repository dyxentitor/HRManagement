# HRMS M0 — Repo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty monorepo with working Docker Compose, CI, pre-commit, OpenAPI contract codegen, and `make {dev,test,migrate,contracts}` — all green on a hello-world commit. No HRMS feature code yet.

**Architecture:** Monorepo (`apps/api` Django+DRF, `apps/web` React+Vite, `packages/contracts` generated TS types). Container-first development (Postgres/Redis/MinIO/MailHog/API/worker/beat/web/nginx via Docker Compose). API contract is single source of truth — TS types regenerated from drf-spectacular OpenAPI on every change.

**Tech Stack:**
- Backend: Python 3.12, Django 5.0, Django REST Framework 3.15, drf-spectacular, Celery, pytest, ruff, mypy, uv
- Frontend: Node 20 LTS, pnpm 9, Vite 5, React 18, TypeScript 5.4, Tailwind CSS 3.4, shadcn/ui, biome, vitest
- Infra: Postgres 16, Redis 7, MinIO, MailHog (dev), Nginx, Docker Compose v2
- CI: GitHub Actions
- Tooling: pre-commit, openapi-typescript

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §9 milestone M0.

---

## File Structure (created in this milestone)

```
hrms/
├── apps/
│   ├── api/
│   │   ├── pyproject.toml
│   │   ├── uv.lock
│   │   ├── manage.py
│   │   ├── conftest.py
│   │   ├── pytest.ini
│   │   ├── Dockerfile
│   │   ├── .dockerignore
│   │   ├── hrms_api/
│   │   │   ├── __init__.py
│   │   │   ├── settings/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py
│   │   │   │   ├── dev.py
│   │   │   │   ├── test.py
│   │   │   │   └── prod.py
│   │   │   ├── urls.py
│   │   │   ├── wsgi.py
│   │   │   ├── asgi.py
│   │   │   └── celery.py
│   │   ├── modules/
│   │   │   └── health/
│   │   │       ├── __init__.py
│   │   │       ├── apps.py
│   │   │       ├── urls.py
│   │   │       ├── views.py
│   │   │       └── tests/
│   │   │           ├── __init__.py
│   │   │           └── test_views.py
│   │   └── common/
│   │       └── __init__.py
│   └── web/
│       ├── package.json
│       ├── pnpm-lock.yaml
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── biome.json
│       ├── index.html
│       ├── Dockerfile
│       ├── .dockerignore
│       ├── public/
│       │   └── favicon.svg
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── App.test.tsx
│           ├── index.css
│           └── vite-env.d.ts
├── packages/
│   └── contracts/
│       ├── package.json
│       ├── README.md
│       ├── openapi.yaml
│       └── generated.ts
├── deploy/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
│       └── default.conf
├── docs/
│   ├── superpowers/
│   │   ├── specs/2026-04-27-hrms-design.md  # already exists
│   │   └── plans/2026-04-27-hrms-m0-repo-scaffold.md  # this file
│   ├── adr/.gitkeep
│   └── runbooks/.gitkeep
├── .github/
│   └── workflows/
│       └── ci.yml
├── .pre-commit-config.yaml
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .env.example
├── pnpm-workspace.yaml
├── Makefile
├── README.md
└── CHANGELOG.md
```

---

## Conventions used in every task

- Working directory: `/home/universal/Claude/HR_Management/`
- Every step that changes code/config gives the **exact file path** and the **complete new content** of the file (or an exact diff).
- Every shell command shows **exact text** and **expected output line(s)** so you know whether it worked.
- Each task ends with a single commit. Commit messages follow Conventional Commits (`feat:`, `chore:`, `ci:`, `build:`, `test:`).
- Identity is set per-command (not via `git config --global`):
  ```bash
  git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "..."
  ```
  Repeat this prefix on every commit in this plan.

---

## Task 1: Root project files (gitignore, editorconfig, env example, README, CHANGELOG, .gitattributes)

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `docs/adr/.gitkeep`
- Create: `docs/runbooks/.gitkeep`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
env/
ENV/
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/
htmlcov/
.coverage
coverage.xml

# Node
node_modules/
.pnpm-store/
dist/
build/
*.tsbuildinfo
.turbo/

# Vite
.vite/

# Editor / OS
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json.sample
*.swp
*.swo

# Env / secrets
.env
.env.local
.env.*.local
*.pem
*.key

# Django
db.sqlite3
db.sqlite3-journal
media/
staticfiles/

# Docker / runtime
docker-data/
*.log
logs/

# Misc
.tmp/
.cache/
```

- [ ] **Step 2: Create `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{py,md}]
indent_size = 4

[Makefile]
indent_style = tab
```

- [ ] **Step 4: Create `.env.example`**

```bash
# === Django ===
DJANGO_SETTINGS_MODULE=hrms_api.settings.dev
DJANGO_SECRET_KEY=change-me-in-prod
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,api

# === Field-level encryption (32-byte key, base64 encoded) ===
HRMS_FIELD_ENCRYPTION_KEY=

# === Database ===
DATABASE_URL=postgres://hrms:hrms@postgres:5432/hrms

# === Redis (cache + Celery broker) ===
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# === Object storage (S3-compatible: MinIO in dev, S3 in prod) ===
S3_ENDPOINT_URL=http://minio:9000
S3_ACCESS_KEY=hrms
S3_SECRET_KEY=hrms-dev-secret
S3_BUCKET=hrms
S3_REGION=us-east-1
S3_USE_SSL=0

# === Email (MailHog in dev, real SMTP in prod) ===
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=0
DEFAULT_FROM_EMAIL=hrms@provintell.local

# === Frontend ===
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 5: Create `README.md`**

```markdown
# HRMS — HR Management System

Phase 1 web HRMS for Provintell. Phase 2 SaaS, Phase 3 mobile.

See [`docs/superpowers/specs/2026-04-27-hrms-design.md`](docs/superpowers/specs/2026-04-27-hrms-design.md) for the full design.

## Quick start (dev)

Prerequisites: Docker, Docker Compose v2, GNU Make.

\`\`\`bash
cp .env.example .env
make dev          # bring up the full stack
\`\`\`

After ~30 seconds:

- API: http://localhost:8000/health/ready
- API docs: http://localhost:8000/api/v1/docs/
- Web: http://localhost:5173
- MinIO console: http://localhost:9001 (hrms / hrms-dev-secret)
- MailHog: http://localhost:8025

## Make targets

| Target | Effect |
|---|---|
| `make dev` | Start the full Docker stack |
| `make dev-down` | Stop and remove all dev containers |
| `make migrate` | Run Django migrations |
| `make test` | Run backend + frontend test suites |
| `make test-api` | Backend tests only |
| `make test-web` | Frontend tests only |
| `make contracts` | Regenerate OpenAPI + TS types |
| `make lint` | Run all linters |
| `make build` | Build production Docker images |

## Repository layout

\`\`\`
apps/api          Django 5 + DRF backend
apps/web          React 18 + Vite frontend
packages/contracts  Generated OpenAPI + TS types (committed)
deploy            Docker Compose, nginx, prod overrides
docs              Specs, plans, ADRs, runbooks
\`\`\`

## Contributing

1. Read the design spec.
2. Pick the next milestone plan from `docs/superpowers/plans/`.
3. Open a PR with the milestone in the branch name (e.g., `m1/identity-rbac`).

## License

Proprietary — Provintell.
```

- [ ] **Step 6: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- M0: Repo scaffold (Docker Compose, CI, pre-commit, OpenAPI contract codegen).
```

- [ ] **Step 7: Create empty placeholders for ADR and runbooks dirs**

```bash
mkdir -p docs/adr docs/runbooks
touch docs/adr/.gitkeep docs/runbooks/.gitkeep
```

- [ ] **Step 8: Verify file presence**

Run:
```bash
ls -la .gitignore .gitattributes .editorconfig .env.example README.md CHANGELOG.md docs/adr/.gitkeep docs/runbooks/.gitkeep
```
Expected: all 8 files listed, no errors.

- [ ] **Step 9: Commit**

```bash
git add .gitignore .gitattributes .editorconfig .env.example README.md CHANGELOG.md docs/adr/.gitkeep docs/runbooks/.gitkeep
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: add root project files (.gitignore, README, CHANGELOG, env example)"
```

---

## Task 2: Set up Python tooling (uv) and Django project skeleton

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/manage.py`
- Create: `apps/api/hrms_api/__init__.py`
- Create: `apps/api/hrms_api/settings/__init__.py`
- Create: `apps/api/hrms_api/settings/base.py`
- Create: `apps/api/hrms_api/settings/dev.py`
- Create: `apps/api/hrms_api/settings/test.py`
- Create: `apps/api/hrms_api/settings/prod.py`
- Create: `apps/api/hrms_api/urls.py`
- Create: `apps/api/hrms_api/wsgi.py`
- Create: `apps/api/hrms_api/asgi.py`
- Create: `apps/api/hrms_api/celery.py`
- Create: `apps/api/conftest.py`
- Create: `apps/api/pytest.ini`
- Create: `apps/api/common/__init__.py`

- [ ] **Step 1: Verify uv is installed (or install)**

Run:
```bash
uv --version
```
Expected: `uv 0.4.x` or later. If not installed:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

- [ ] **Step 2: Create `apps/api/` and initialize uv**

```bash
mkdir -p apps/api && cd apps/api && uv init --name hrms-api --no-readme --python 3.12 && cd ../..
```
Expected: `apps/api/pyproject.toml` and `apps/api/hello.py` created. We'll replace pyproject.toml below and remove `hello.py`.

```bash
rm apps/api/hello.py
```

- [ ] **Step 3: Replace `apps/api/pyproject.toml` with the production version**

```toml
[project]
name = "hrms-api"
version = "0.1.0"
description = "HRMS Phase 1 backend (Django + DRF)"
requires-python = ">=3.12"
dependencies = [
  "django>=5.0,<5.1",
  "djangorestframework>=3.15,<3.16",
  "drf-spectacular>=0.27,<0.28",
  "django-cors-headers>=4.3,<5.0",
  "django-environ>=0.11,<0.12",
  "psycopg[binary]>=3.1,<4.0",
  "redis>=5.0,<6.0",
  "celery>=5.3,<6.0",
  "django-celery-beat>=2.6,<3.0",
  "boto3>=1.34,<2.0",
  "argon2-cffi>=23.1,<24.0",
  "pyotp>=2.9,<3.0",
  "structlog>=24.1,<25.0",
  "gunicorn>=22.0,<23.0",
  "uvicorn[standard]>=0.30,<0.31",
  "whitenoise>=6.6,<7.0",
]

[dependency-groups]
dev = [
  "pytest>=8.2,<9.0",
  "pytest-django>=4.8,<5.0",
  "pytest-cov>=5.0,<6.0",
  "pytest-xdist>=3.6,<4.0",
  "factory-boy>=3.3,<4.0",
  "freezegun>=1.5,<2.0",
  "ruff>=0.5,<1.0",
  "mypy>=1.10,<2.0",
  "django-stubs[compatible-mypy]>=5.0,<6.0",
  "djangorestframework-stubs[compatible-mypy]>=3.15,<4.0",
  "bandit>=1.7,<2.0",
]

[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["*/migrations/*"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "N", "S", "DJ", "RUF"]
ignore = ["S101"]  # allow `assert` in tests

[tool.ruff.lint.per-file-ignores]
"**/tests/**" = ["S", "N", "B"]

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
python_version = "3.12"
plugins = ["mypy_django_plugin.main", "mypy_drf_plugin.main"]
strict_optional = true
warn_unused_ignores = true
ignore_missing_imports = true

[tool.django-stubs]
django_settings_module = "hrms_api.settings.test"
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
cd apps/api && uv sync && cd ../..
```
Expected: `Resolved N packages` then `Installed N packages`. A `apps/api/uv.lock` and `apps/api/.venv/` are created.

- [ ] **Step 5: Create `apps/api/manage.py`**

```python
#!/usr/bin/env python
"""Django management entry point."""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Activate the virtualenv or run `uv sync`."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Create the `hrms_api/` package files**

Create `apps/api/hrms_api/__init__.py`:
```python
from .celery import app as celery_app

__all__ = ("celery_app",)
```

Create `apps/api/hrms_api/settings/__init__.py`:
```python
# Settings module is split across base.py / dev.py / test.py / prod.py.
```

Create `apps/api/hrms_api/settings/base.py`:
```python
"""Base Django settings — shared across dev/test/prod."""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # apps/api/
ROOT_DIR = BASE_DIR.parent.parent  # repo root

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    S3_USE_SSL=(bool, False),
    SMTP_USE_TLS=(bool, False),
)

# Read .env if present (dev convenience; prod uses real env vars)
env_file = ROOT_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-replace-me")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "django_celery_beat",
    # Local
    "modules.health",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "hrms_api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "hrms_api.wsgi.application"
ASGI_APPLICATION = "hrms_api.asgi.application"

DATABASES = {
    "default": env.db_url("DATABASE_URL", default="sqlite:////tmp/hrms.sqlite3"),
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/2")
CELERY_TIMEZONE = "Asia/Kuala_Lumpur"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en-my"
TIME_ZONE = "Asia/Kuala_Lumpur"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "HRMS API",
    "DESCRIPTION": "HR Management System — Phase 1",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
}

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)

# Argon2id for passwords
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
```

Create `apps/api/hrms_api/settings/dev.py`:
```python
from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]
```

Create `apps/api/hrms_api/settings/test.py`:
```python
from .base import *  # noqa: F401,F403

DEBUG = False
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
```

Create `apps/api/hrms_api/settings/prod.py`:
```python
"""Production Django settings — fail-fast on misconfiguration."""
import sys

from .base import *  # noqa: F401,F403
from .base import DEBUG, SECRET_KEY  # for the guards below to reference imported values

# base.py reads DJANGO_DEBUG from env; if anyone sets DJANGO_DEBUG=1 in prod, we abort.
if DEBUG:
    sys.stderr.write("FATAL: DJANGO_DEBUG must be unset or 0 in production\n")
    sys.exit(1)

# Critical 2: refuse to start with the insecure default secret key.
if SECRET_KEY == "dev-insecure-replace-me":
    sys.stderr.write("FATAL: DJANGO_SECRET_KEY must be set in production\n")
    sys.exit(1)

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"
```

- [ ] **Step 7: Create `apps/api/hrms_api/urls.py`**

```python
"""Root URL config. Module URLs mounted under /api/v1/."""
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns = [
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]

urlpatterns = [
    path("api/v1/", include((api_v1_patterns, "v1"))),
    path("", include("modules.health.urls")),
]
```

- [ ] **Step 8: Create `apps/api/hrms_api/wsgi.py`**

```python
"""WSGI entry point for production servers (gunicorn)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.prod")

application = get_wsgi_application()
```

- [ ] **Step 9: Create `apps/api/hrms_api/asgi.py`**

```python
"""ASGI entry point."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.prod")

application = get_asgi_application()
```

- [ ] **Step 10: Create `apps/api/hrms_api/celery.py`**

```python
"""Celery app — autodiscovers tasks from each module."""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.dev")

app = Celery("hrms_api")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
```

- [ ] **Step 11: Create `apps/api/conftest.py` and `apps/api/pytest.ini`**

`apps/api/conftest.py`:
```python
"""pytest fixtures shared across all tests."""
import pytest


@pytest.fixture(autouse=True)
def _media_root(tmp_path, settings):
    """Isolate file uploads to a tmp dir per test."""
    settings.MEDIA_ROOT = tmp_path / "media"
```

`apps/api/pytest.ini`:
```ini
[pytest]
DJANGO_SETTINGS_MODULE = hrms_api.settings.test
python_files = test_*.py *_test.py
addopts = -ra --strict-markers --strict-config
testpaths = modules common
```

- [ ] **Step 12: Create empty `apps/api/common/__init__.py`**

```bash
mkdir -p apps/api/common && touch apps/api/common/__init__.py
```

- [ ] **Step 13: Verify Django can introspect (no health module yet — expected to fail on missing app)**

Run:
```bash
cd apps/api && uv run python manage.py check && cd ../..
```
Expected: ❌ `ModuleNotFoundError: No module named 'modules'` (because we reference `modules.health` in INSTALLED_APPS but haven't created it yet). **This failure is expected — we wire up the health module in Task 3.**

- [ ] **Step 14: Commit**

```bash
git add apps/api/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(api): scaffold Django 5 + DRF project with split settings"
```

---

## Task 3: Health module with TDD-driven endpoints

**Files:**
- Create: `apps/api/modules/__init__.py`
- Create: `apps/api/modules/health/__init__.py`
- Create: `apps/api/modules/health/apps.py`
- Create: `apps/api/modules/health/urls.py`
- Create: `apps/api/modules/health/views.py`
- Create: `apps/api/modules/health/tests/__init__.py`
- Create: `apps/api/modules/health/tests/test_views.py`

- [ ] **Step 1: Create `modules/` namespace package**

```bash
mkdir -p apps/api/modules/health/tests
touch apps/api/modules/__init__.py
touch apps/api/modules/health/__init__.py
touch apps/api/modules/health/tests/__init__.py
```

- [ ] **Step 2: Write the failing test FIRST**

Create `apps/api/modules/health/tests/test_views.py`:
```python
"""Tests for the health endpoints."""
import pytest
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def test_health_returns_200_and_ok(client: APIClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_health_ready_returns_200_when_db_reachable(client: APIClient) -> None:
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"
```

- [ ] **Step 3: Run the test — expect collection failure (no app, no view)**

Run:
```bash
cd apps/api && uv run pytest modules/health/tests/test_views.py -v && cd ../..
```
Expected: ❌ `ModuleNotFoundError` or test collection fails because `modules.health` is in INSTALLED_APPS but has no `apps.py`.

- [ ] **Step 4: Create `apps/api/modules/health/apps.py`**

```python
from django.apps import AppConfig


class HealthConfig(AppConfig):
    name = "modules.health"
    label = "health"
    verbose_name = "Health checks"
```

- [ ] **Step 5: Create `apps/api/modules/health/views.py`**

```python
"""Health check views — used by liveness/readiness probes and uptime monitors."""
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request: object) -> Response:
    """Liveness check — process is up."""
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def ready(_request: object) -> Response:
    """Readiness check — dependencies (DB) reachable."""
    checks: dict[str, str] = {}
    overall_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:  # pragma: no cover - exercised via integration
        checks["database"] = f"error: {exc}"
        overall_ok = False
    return Response(
        {"status": "ready" if overall_ok else "not_ready", "checks": checks},
        status=status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
```

- [ ] **Step 6: Create `apps/api/modules/health/urls.py`**

```python
from django.urls import path

from .views import health, ready

urlpatterns = [
    path("health", health, name="health"),
    path("health/ready", ready, name="health-ready"),
]
```

- [ ] **Step 7: Re-run the tests — expect both PASS**

Run:
```bash
cd apps/api && uv run pytest modules/health/tests/test_views.py -v && cd ../..
```
Expected:
```
modules/health/tests/test_views.py::test_health_returns_200_and_ok PASSED
modules/health/tests/test_views.py::test_health_ready_returns_200_when_db_reachable PASSED
```

- [ ] **Step 8: Verify `manage.py check` is now clean**

Run:
```bash
cd apps/api && uv run python manage.py check && cd ../..
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 9: Commit**

```bash
git add apps/api/modules/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(api): add health and readiness endpoints with tests"
```

---

## Task 4: Verify drf-spectacular schema generation

**Files:**
- Modify: none (settings already wired in Task 2)
- Verification only.

- [ ] **Step 1: Generate the OpenAPI schema**

Run:
```bash
cd apps/api && uv run python manage.py spectacular --color --validate --file /tmp/openapi-smoke.yaml && cd ../..
```
Expected: file written, no validation errors.

- [ ] **Step 2: Verify it contains health endpoints**

Run:
```bash
grep -E "(/health|/health/ready)" /tmp/openapi-smoke.yaml
```
Expected: at least 2 matches showing the paths registered.

- [ ] **Step 3: Start the dev server and hit the docs UI**

Run:
```bash
cd apps/api && uv run python manage.py runserver 0.0.0.0:8000 &
sleep 3
curl -sf http://localhost:8000/health
curl -sf http://localhost:8000/api/v1/schema/ -H 'Accept: application/json' | head -c 200
kill %1
cd ../..
```
Expected: `{"status":"ok"}` from `/health`; OpenAPI JSON preview from `/api/v1/schema/`.

- [ ] **Step 4: No commit — verification only.** Move to Task 5.

---

## Task 5: pnpm workspace + frontend scaffold (apps/web)

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/biome.json`
- Create: `apps/web/index.html`
- Create: `apps/web/public/favicon.svg`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/vite-env.d.ts`

- [ ] **Step 1: Verify pnpm and Node are installed**

Run:
```bash
node --version && pnpm --version
```
Expected: Node ≥ 20, pnpm ≥ 9. If pnpm is missing:
```bash
corepack enable && corepack prepare pnpm@9 --activate
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`** (repo root)

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `apps/web/package.json`**

```bash
mkdir -p apps/web/src apps/web/public
```

```json
{
  "name": "@hrms/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.8.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "happy-dom": "^14.12.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `apps/web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "tailwind.config.ts"]
}
```

- [ ] **Step 6: Create `apps/web/vite.config.ts`**

```typescript
import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.json `paths` entry `"@/*": ["src/*"]`.
    // Vite resolves `@/foo` by prefix-substituting `@` with the resolved src dir.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
})
```

- [ ] **Step 7: Create `apps/web/vitest.config.ts`**

```typescript
import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.json `paths` entry `"@/*": ["src/*"]`.
    // Vite resolves `@/foo` by prefix-substituting `@` with the resolved src dir.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      reporter: ["text", "html", "lcov"],
    },
  },
})
```

- [ ] **Step 8: Create `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss"

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 9: Create `apps/web/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 10: Create `apps/web/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noConsole": { "level": "warn", "options": { "allow": ["error", "warn"] } }
      },
      "security": {
        "noDangerouslySetInnerHtml": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "asNeeded" }
  }
}
```

- [ ] **Step 11: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HRMS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 12: Create `apps/web/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
</svg>
```

- [ ] **Step 13: Create `apps/web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}
```

- [ ] **Step 14: Create `apps/web/src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 15: Create `apps/web/src/test-setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 16: Write the failing test FIRST**

Create `apps/web/src/App.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "./App"

describe("App", () => {
  it("renders the HRMS heading", () => {
    render(<App />)
    expect(screen.getByRole("heading", { name: /HRMS/i })).toBeInTheDocument()
  })

  it("shows the milestone label", () => {
    render(<App />)
    expect(screen.getByText(/M0 — Repo Scaffold/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 17: Install frontend dependencies**

Run:
```bash
cd apps/web && pnpm install && cd ../..
```
Expected: `Done in N.Ns`. A `pnpm-lock.yaml` is created at the repo root (workspace lockfile).

- [ ] **Step 18: Run the test — expect FAIL**

Run:
```bash
cd apps/web && pnpm test && cd ../..
```
Expected: ❌ Fails because `App.tsx` doesn't exist.

- [ ] **Step 19: Create `apps/web/src/App.tsx`**

```typescript
export function App() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">HRMS</h1>
        <p className="text-sm text-slate-600">M0 — Repo Scaffold</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 20: Create `apps/web/src/main.tsx`**

```typescript
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 21: Re-run the tests — expect PASS**

Run:
```bash
cd apps/web && pnpm test && cd ../..
```
Expected:
```
✓ src/App.test.tsx (2 tests)
  ✓ App > renders the HRMS heading
  ✓ App > shows the milestone label
```

- [ ] **Step 22: Verify build succeeds**

Run:
```bash
cd apps/web && pnpm build && cd ../..
```
Expected: `dist/` directory created; no TypeScript errors.

- [ ] **Step 23: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml apps/web/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(web): scaffold Vite + React + TS + Tailwind with smoke test"
```

---

## Task 6: packages/contracts (OpenAPI → TS codegen)

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/README.md`
- Create: `packages/contracts/openapi.yaml` (placeholder, will be overwritten by `make contracts`)
- Create: `packages/contracts/generated.ts` (placeholder)

- [ ] **Step 1: Create `packages/contracts/package.json`**

```bash
mkdir -p packages/contracts
```

```json
{
  "name": "@hrms/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "generated.ts",
  "scripts": {
    "generate": "openapi-typescript ./openapi.yaml -o ./generated.ts"
  },
  "devDependencies": {
    "openapi-typescript": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/README.md`**

```markdown
# @hrms/contracts

Generated TypeScript types from the API's OpenAPI schema.

## Regenerate

From the repo root:

\`\`\`bash
make contracts
\`\`\`

This runs `drf-spectacular` against the Django app to dump `openapi.yaml`, then runs `openapi-typescript` to produce `generated.ts`.

Both files are committed to this repo. CI fails if regenerating produces a diff (use `make contracts` and commit the result).
```

- [ ] **Step 3: Create placeholder `packages/contracts/openapi.yaml`**

```yaml
# Auto-generated. Do not edit by hand. Run `make contracts` to regenerate.
openapi: 3.0.3
info:
  title: HRMS API
  version: 0.1.0
paths: {}
```

- [ ] **Step 4: Create placeholder `packages/contracts/generated.ts`**

```typescript
// Auto-generated. Do not edit by hand. Run `make contracts` to regenerate.
export type paths = Record<string, never>
export type components = { schemas: Record<string, never> }
```

- [ ] **Step 5: Install codegen tooling**

Run:
```bash
cd packages/contracts && pnpm install && cd ../..
```
Expected: lockfile updated, `openapi-typescript` available.

- [ ] **Step 6: Verify generation works against the placeholder**

Run:
```bash
cd packages/contracts && pnpm run generate && cd ../..
```
Expected: `generated.ts` rewritten (still essentially empty since openapi.yaml has no paths). No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/ pnpm-lock.yaml
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(contracts): scaffold OpenAPI → TypeScript codegen"
```

---

## Task 7: API Dockerfile

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

- [ ] **Step 1: Create `apps/api/.dockerignore`**

```
.venv/
__pycache__/
*.pyc
*.pyo
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/
.coverage
.git/
.gitignore
README.md
*.log
```

- [ ] **Step 2: Create `apps/api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv is the package manager
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies layer (cacheable) ---
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# --- Application layer ---
COPY . .

# Collect static (no-op until we have any; safe to run)
RUN uv run python manage.py collectstatic --noinput || true

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "hrms_api.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
```

- [ ] **Step 3: Verify the image builds**

Run:
```bash
docker build -t hrms-api:m0 -f apps/api/Dockerfile apps/api/
```
Expected: build succeeds; final image tagged `hrms-api:m0`.

- [ ] **Step 4: Smoke-run the image**

Run:
```bash
docker run --rm -d --name hrms-api-smoke -p 18000:8000 \
  -e DJANGO_SETTINGS_MODULE=hrms_api.settings.dev \
  -e DJANGO_SECRET_KEY=smoke \
  -e DATABASE_URL=sqlite:////tmp/smoke.db \
  hrms-api:m0
sleep 5
curl -sf http://localhost:18000/health
docker logs hrms-api-smoke | tail -20
docker stop hrms-api-smoke
```
Expected: `{"status":"ok"}` from curl. Container stopped cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "build(api): add Dockerfile + .dockerignore"
```

---

## Task 8: Web Dockerfile + nginx

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/.dockerignore`
- Create: `deploy/nginx/default.conf`

- [ ] **Step 1: Create `apps/web/.dockerignore`**

```
node_modules/
dist/
.vite/
*.log
.git/
.gitignore
README.md
```

- [ ] **Step 2: Create `apps/web/Dockerfile`** (multi-stage: build with Node, serve with nginx)

> **Note:** Build context must be the **repo root** (`.`), not `apps/web/`, because
> `pnpm-lock.yaml` and `pnpm-workspace.yaml` live at the repo root and the COPY
> instructions need to reach them. See the corrected build command in Step 4.
>
> Also create `apps/web/nginx-default.conf` — the minimal SPA-fallback config that
> is COPYed into the image. (`deploy/nginx/default.conf` is the richer config with
> API reverse-proxy, mounted at runtime by docker-compose.prod.yml.)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace metadata first for better caching
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

# Fetch and install for the web app only (workspace-aware)
RUN pnpm install --frozen-lockfile --filter @hrms/web

# Copy the rest of the web app and the contracts package (web depends on contracts in M1+)
COPY apps/web/ ./apps/web/
COPY packages/contracts/ ./packages/contracts/

WORKDIR /app/apps/web
RUN pnpm build

# --- Runtime ---
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Embedded SPA-fallback config (copied from apps/web/nginx-default.conf in the
# build context). Override at runtime by mounting deploy/nginx/default.conf onto
# /etc/nginx/conf.d/default.conf if you need the richer config with API
# reverse-proxy (used by docker-compose.prod.yml).
COPY apps/web/nginx-default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Create `deploy/nginx/default.conf`** (the SPA config used by Compose to front the web container)

```bash
mkdir -p deploy/nginx
```

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse-proxy API to the api service
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://api:8000/health;
    }
}
```

- [ ] **Step 4: Verify the web image builds**

> **Build context is the repo root** (`.`), not `apps/web/`, so the COPY instructions
> can reach `pnpm-lock.yaml` and `pnpm-workspace.yaml`.

Run:
```bash
sg docker -c 'docker build -t hrms-web:m0 -f apps/web/Dockerfile .'
```
Expected: build succeeds.

Smoke-run to verify nginx serves the SPA:
```bash
sg docker -c 'docker run --rm -d --name hrms-web-smoke -p 18080:80 hrms-web:m0'
sleep 3
curl -sf http://localhost:18080/ | head -5          # index.html
curl -sf http://localhost:18080/healthz             # ok
curl -sf http://localhost:18080/some/spa/route | head -3  # SPA fallback → index.html
sg docker -c 'docker stop hrms-web-smoke'
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/Dockerfile apps/web/.dockerignore apps/web/nginx-default.conf deploy/nginx/default.conf docs/superpowers/plans/2026-04-27-hrms-m0-repo-scaffold.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "build(web): add Dockerfile + nginx config

Embeds SPA-fallback nginx config inline; deploy/nginx/default.conf
provides the richer reverse-proxy config for docker-compose.prod.yml
to mount at runtime. Build context is the repo root because the pnpm
workspace lockfile lives there.

Plan updated to match the corrected Dockerfile and build command."
```

---

## Task 9: Docker Compose for development

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/docker-compose.prod.yml`

- [ ] **Step 1: Create `deploy/docker-compose.yml`**

```yaml
name: hrms-dev

x-api-env: &api-env
  DJANGO_SETTINGS_MODULE: hrms_api.settings.dev
  DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY:-dev-insecure-replace-me}
  DJANGO_DEBUG: "1"
  DJANGO_ALLOWED_HOSTS: "*"
  DATABASE_URL: postgres://hrms:hrms@postgres:5432/hrms
  REDIS_URL: redis://redis:6379/0
  CELERY_BROKER_URL: redis://redis:6379/1
  CELERY_RESULT_BACKEND: redis://redis:6379/2
  S3_ENDPOINT_URL: http://minio:9000
  S3_ACCESS_KEY: hrms
  S3_SECRET_KEY: hrms-dev-secret
  S3_BUCKET: hrms
  SMTP_HOST: mailhog
  SMTP_PORT: "1025"
  HRMS_FIELD_ENCRYPTION_KEY: ${HRMS_FIELD_ENCRYPTION_KEY:-dev-32byte-key-change-in-prod-pls}

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hrms
      POSTGRES_PASSWORD: hrms
      POSTGRES_DB: hrms
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: hrms
      MINIO_ROOT_PASSWORD: hrms-dev-secret
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"
      - "8025:8025"

  api:
    build:
      context: ../apps/api
      dockerfile: Dockerfile
    environment: *api-env
    volumes:
      - ../apps/api:/app
      - /app/.venv
      - /app/staticfiles
    command: uv run python manage.py runserver 0.0.0.0:8000
    ports: ["8000:8000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
      mailhog: { condition: service_started }
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 12

  worker:
    build:
      context: ../apps/api
      dockerfile: Dockerfile
    environment: *api-env
    volumes:
      - ../apps/api:/app
      - /app/.venv
      - /app/staticfiles
    command: uv run celery -A hrms_api worker -l info
    restart: on-failure
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  beat:
    build:
      context: ../apps/api
      dockerfile: Dockerfile
    environment: *api-env
    volumes:
      - ../apps/api:/app
      - /app/.venv
      - /app/staticfiles
    command: uv run celery -A hrms_api beat -l info -S django
    restart: on-failure
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  web:
    image: node:20-alpine
    working_dir: /repo/apps/web
    volumes:
      - ..:/repo                           # entire repo
      - /repo/apps/web/node_modules         # named volume — keep node_modules in-container
      - /repo/node_modules
    command: >
      sh -c "corepack enable && corepack prepare pnpm@9 --activate &&
             cd /repo && pnpm install --filter @hrms/web... &&
             cd /repo/apps/web && pnpm dev --host 0.0.0.0"
    environment:
      VITE_API_BASE_URL: http://localhost:8000
    ports: ["5173:5173"]

volumes:
  postgres-data:
  minio-data:
```

- [ ] **Step 2: Create `deploy/docker-compose.prod.yml`** (overrides for prod)

```yaml
name: hrms-prod

services:
  api:
    build:
      context: ../apps/api
      dockerfile: Dockerfile
    environment:
      DJANGO_SETTINGS_MODULE: hrms_api.settings.prod
      DJANGO_DEBUG: "0"
    volumes: []   # no bind-mount in prod
    command: uv run gunicorn hrms_api.wsgi:application --bind 0.0.0.0:8000 --workers 4

  worker:
    volumes: []
    command: uv run celery -A hrms_api worker -l warning --concurrency 4

  beat:
    volumes: []
    command: uv run celery -A hrms_api beat -l warning -S django

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    command: ["nginx", "-g", "daemon off;"]
    volumes: []
    ports: ["80:80"]

  mailhog:
    profiles: ["dev-only"]   # don't start in prod

  minio:
    profiles: ["dev-only"]   # prod uses real S3
```

- [ ] **Step 3: Bring up the dev stack**

Run:
```bash
cp .env.example .env
sg docker -c 'docker compose -f deploy/docker-compose.yml up -d --build'
```
Expected: all services start. Wait ~60 seconds for healthchecks and pnpm install.

- [ ] **Step 4: Verify all services are healthy**

Run:
```bash
sg docker -c 'docker compose -f deploy/docker-compose.yml ps'
```
Expected: every service shows `running` (and `healthy` for the ones with healthchecks).

- [ ] **Step 5: Smoke-test the API through Compose**

Run:
```bash
curl -sf http://localhost:8000/health
curl -sf http://localhost:8000/health/ready
```
Expected: `{"status":"ok"}` and `{"status":"ready","checks":{"database":"ok"}}`.

- [ ] **Step 6: Smoke-test the web through Compose**

Run:
```bash
curl -sf http://localhost:5173/ | head -20
```
Expected: HTML containing `<div id="root"></div>` and the Vite client script.

- [ ] **Step 7: Tear down**

Run:
```bash
sg docker -c 'docker compose -f deploy/docker-compose.yml down'
```

- [ ] **Step 8: Commit**

```bash
git add deploy/docker-compose.yml deploy/docker-compose.prod.yml docs/superpowers/plans/2026-04-27-hrms-m0-repo-scaffold.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "build: add docker-compose for dev + prod overrides"
```

---

## Task 10: Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create `Makefile`**

```makefile
.DEFAULT_GOAL := help
SHELL := /bin/bash

COMPOSE := docker compose -f deploy/docker-compose.yml
COMPOSE_PROD := docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml

.PHONY: help dev dev-down dev-logs migrate makemigrations shell test test-api test-web \
        contracts lint lint-fix typecheck build seed clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start the full dev stack (Postgres, Redis, MinIO, MailHog, API, worker, beat, web)
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example"; fi
	$(COMPOSE) up -d --build
	@echo ""
	@echo "API:           http://localhost:8000/health/ready"
	@echo "API docs:      http://localhost:8000/api/v1/docs/"
	@echo "Web:           http://localhost:5173"
	@echo "MinIO console: http://localhost:9001"
	@echo "MailHog:       http://localhost:8025"

dev-down: ## Stop and remove dev containers
	$(COMPOSE) down

dev-logs: ## Tail logs from all services
	$(COMPOSE) logs -f

migrate: ## Run Django migrations
	$(COMPOSE) exec api uv run python manage.py migrate

makemigrations: ## Generate new migrations from model changes
	$(COMPOSE) exec api uv run python manage.py makemigrations

shell: ## Django shell
	$(COMPOSE) exec api uv run python manage.py shell

test: test-api test-web ## Run all tests

test-api: ## Run backend tests
	cd apps/api && uv run pytest -n auto --cov=. --cov-report=term-missing

test-web: ## Run frontend tests
	cd apps/web && pnpm test

contracts: ## Regenerate OpenAPI schema and TS types
	cd apps/api && uv run python manage.py spectacular --color --validate \
	  --file ../../packages/contracts/openapi.yaml
	cd packages/contracts && pnpm run generate
	@echo "Contracts regenerated. Commit packages/contracts/ if there are changes."

lint: ## Run all linters
	cd apps/api && uv run ruff check .
	cd apps/api && uv run ruff format --check .
	cd apps/web && pnpm lint
	cd apps/web && pnpm typecheck

lint-fix: ## Auto-fix lint issues
	cd apps/api && uv run ruff check --fix .
	cd apps/api && uv run ruff format .
	cd apps/web && pnpm lint:fix

typecheck: ## Static type-check the backend
	cd apps/api && uv run mypy hrms_api modules common

build: ## Build production Docker images
	docker build -t hrms-api:latest -f apps/api/Dockerfile apps/api/
	docker build -t hrms-web:latest -f apps/web/Dockerfile apps/web/

seed: ## (Phase 1+) Load demo data — implemented in M12
	@echo "Seeder lands in M12. Not yet implemented."
	@false

clean: ## Remove build artifacts
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +
	find . -type d -name .ruff_cache -prune -exec rm -rf {} +
	find . -type d -name .mypy_cache -prune -exec rm -rf {} +
	find . -type d -name node_modules -prune -exec rm -rf {} +
	find . -type d -name dist -prune -exec rm -rf {} +
	find . -type d -name .venv -prune -exec rm -rf {} +
```

- [ ] **Step 2: Verify each target**

Run:
```bash
make help
```
Expected: list of targets prints.

```bash
make dev
sleep 30
make migrate
```
Expected: `make dev` brings everything up; `make migrate` runs Django migrations cleanly (default Django apps only — no app migrations exist yet).

```bash
make contracts
```
Expected: `packages/contracts/openapi.yaml` and `packages/contracts/generated.ts` regenerated.

```bash
make test
```
Expected: backend tests pass (2 health tests); frontend tests pass (2 App tests).

```bash
make lint
```
Expected: ruff + biome + tsc all clean. **If anything fails, fix it inline before continuing.**

```bash
make dev-down
```
Expected: all containers stopped.

- [ ] **Step 3: Commit**

```bash
git add Makefile packages/contracts/openapi.yaml packages/contracts/generated.ts
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "build: add Makefile + regenerate contracts from current schema"
```

---

## Task 11: Pre-commit hooks

**Files:**
- Create: `.pre-commit-config.yaml`

- [ ] **Step 1: Create `.pre-commit-config.yaml`**

```yaml
default_language_version:
  python: python3.12

repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: check-merge-conflict
      - id: check-json
      - id: check-yaml
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-case-conflict
      - id: check-added-large-files
        args: ["--maxkb=1024"]
      - id: detect-private-key
      - id: mixed-line-ending
        args: ["--fix=lf"]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.7
    hooks:
      - id: ruff
        args: ["--fix"]
        files: ^apps/api/
      - id: ruff-format
        files: ^apps/api/

  - repo: https://github.com/biomejs/pre-commit
    rev: v0.4.0
    hooks:
      - id: biome-check
        additional_dependencies: ["@biomejs/biome@1.8.0"]
        files: ^apps/web/.*\.(ts|tsx|js|jsx|json)$

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ["--baseline", ".secrets.baseline"]
```

- [ ] **Step 2: Generate the secrets baseline**

Run:
```bash
pip install --user detect-secrets || pipx install detect-secrets
detect-secrets scan > .secrets.baseline
```
Expected: `.secrets.baseline` JSON file created at the repo root.

- [ ] **Step 3: Install pre-commit and run on the whole repo**

Run:
```bash
pip install --user pre-commit || pipx install pre-commit
pre-commit install
pre-commit run --all-files
```
Expected: all hooks pass (or auto-fix things). If any hook fails, **read the error, fix the underlying issue, re-run** until clean.

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml .secrets.baseline
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: add pre-commit hooks (ruff, biome, secrets)"
```

---

## Task 12: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```bash
mkdir -p .github/workflows
```

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  api:
    name: API (Django)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: hrms
          POSTGRES_PASSWORD: hrms
          POSTGRES_DB: hrms_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U hrms"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DJANGO_SETTINGS_MODULE: hrms_api.settings.test
      DJANGO_SECRET_KEY: ci
      DATABASE_URL: postgres://hrms:hrms@localhost:5432/hrms_test
      REDIS_URL: redis://localhost:6379/0
      HRMS_FIELD_ENCRYPTION_KEY: ci-32byte-key-change-in-prod-pls!
    steps:
      - uses: actions/checkout@v4
      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.4.x"
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Sync deps
        working-directory: apps/api
        run: uv sync --frozen
      - name: Lint (ruff)
        working-directory: apps/api
        run: |
          uv run ruff check .
          uv run ruff format --check .
      - name: Type-check (mypy)
        working-directory: apps/api
        run: uv run mypy hrms_api modules common
      - name: Migrations check
        working-directory: apps/api
        run: uv run python manage.py makemigrations --check --dry-run
      - name: Run tests
        working-directory: apps/api
        run: uv run pytest -n auto --cov=. --cov-report=xml
      - name: OpenAPI schema validates
        working-directory: apps/api
        run: uv run python manage.py spectacular --validate --file /tmp/openapi.yaml
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-coverage
          path: apps/api/coverage.xml

  web:
    name: Web (React)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - name: Install (workspace)
        run: pnpm install --frozen-lockfile
      - name: Lint (biome)
        working-directory: apps/web
        run: pnpm lint
      - name: Type-check (tsc)
        working-directory: apps/web
        run: pnpm typecheck
      - name: Test (vitest)
        working-directory: apps/web
        run: pnpm test
      - name: Build (vite)
        working-directory: apps/web
        run: pnpm build
      - name: Bundle-size budget
        working-directory: apps/web
        run: |
          gz_total=$(find dist -name '*.js' -exec gzip -c {} \; | wc -c)
          echo "Gzipped JS total: $gz_total bytes"
          if [ "$gz_total" -gt 256000 ]; then
            echo "::error::Gzipped JS total ($gz_total) exceeds 250KB budget"
            exit 1
          fi

  contracts:
    name: Contracts drift check
    runs-on: ubuntu-latest
    needs: [api]
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: hrms
          POSTGRES_PASSWORD: hrms
          POSTGRES_DB: hrms_test
        ports: ["5432:5432"]
    env:
      DJANGO_SETTINGS_MODULE: hrms_api.settings.test
      DJANGO_SECRET_KEY: ci
      DATABASE_URL: postgres://hrms:hrms@localhost:5432/hrms_test
      HRMS_FIELD_ENCRYPTION_KEY: ci-32byte-key-change-in-prod-pls!
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Sync API deps
        working-directory: apps/api
        run: uv sync --frozen
      - name: Regenerate contracts
        run: |
          cd apps/api && uv run python manage.py spectacular --validate --file ../../packages/contracts/openapi.yaml
          cd ../packages/contracts && pnpm run generate
      - name: Diff against committed contracts
        run: |
          if ! git diff --quiet packages/contracts/; then
            echo "::error::OpenAPI/TS contracts are out of date. Run \`make contracts\` and commit."
            git diff packages/contracts/
            exit 1
          fi

  security:
    name: Security scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: fs
          severity: HIGH,CRITICAL
          exit-code: "1"
          ignore-unfixed: true
      - uses: astral-sh/setup-uv@v3
      - name: Bandit (Python)
        working-directory: apps/api
        run: |
          uv sync --frozen
          uv run bandit -r hrms_api modules common -ll
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: pnpm audit
        run: pnpm audit --audit-level=high --prod
        continue-on-error: false
```

- [ ] **Step 2: Push to a CI-runnable remote (or skip if running locally only)**

This step is environment-dependent. If you have a GitHub remote configured:
```bash
git push -u origin master
```
Watch the Actions tab; expect all four jobs (`api`, `web`, `contracts`, `security`) to go green.

If running locally without a GitHub remote, skip this step — the workflow will run when the remote is configured later. Verify the YAML is syntactically valid:
```bash
docker run --rm -v $(pwd):/workspace cytopia/yamllint:latest .github/workflows/ci.yml || \
  python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no parse errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "ci: add CI workflow (api, web, contracts, security)"
```

---

## Task 13: Final integration smoke

This task does **no code changes**. It is a checklist that proves the M0 deliverable.

- [ ] **Step 1: Fresh checkout simulation**

Run:
```bash
make clean
make dev
sleep 45   # let healthchecks settle
```
Expected: `make dev` succeeds; all containers healthy.

- [ ] **Step 2: All endpoints respond**

Run:
```bash
curl -sf http://localhost:8000/health
curl -sf http://localhost:8000/health/ready
curl -sf http://localhost:8000/api/v1/schema/ -H 'Accept: application/json' | head -c 200
curl -sf http://localhost:5173/ | head -20
curl -sf http://localhost:8025/                                  # MailHog UI
curl -sf http://localhost:9001/                                  # MinIO console
```
Expected: all return 200 with sensible content.

- [ ] **Step 3: Migrations and contracts**

Run:
```bash
make migrate
make contracts
git status packages/contracts/
```
Expected: migrations apply (default Django apps); contracts regenerate; **no diff** in `packages/contracts/` (it was committed in Task 10 already in sync).

- [ ] **Step 4: All tests pass**

Run:
```bash
make test
```
Expected: 2 backend tests pass + 2 frontend tests pass.

- [ ] **Step 5: All linters clean**

Run:
```bash
make lint
```
Expected: ruff, ruff format, biome, tsc all clean.

- [ ] **Step 6: Pre-commit hooks clean**

Run:
```bash
pre-commit run --all-files
```
Expected: all hooks pass.

- [ ] **Step 7: Tear down and verify clean shutdown**

Run:
```bash
make dev-down
docker compose -f deploy/docker-compose.yml ps
```
Expected: no running containers from this project.

- [ ] **Step 8: Update CHANGELOG**

Edit `CHANGELOG.md`, change the `## [Unreleased]` block to a dated release header for M0:

```markdown
## [Unreleased]

## [0.1.0-m0] - 2026-04-27

### Added
- M0: Repo scaffold (Docker Compose, CI, pre-commit, OpenAPI contract codegen).
- Django 5 + DRF backend skeleton with split settings (base/dev/test/prod).
- Vite + React + TS + Tailwind frontend skeleton with biome + vitest.
- `packages/contracts` for generated OpenAPI → TypeScript types.
- `make {dev,test,migrate,contracts,lint,build}` targets.
- GitHub Actions CI: api, web, contracts drift, security.
- Pre-commit hooks: ruff, biome, detect-secrets, basic file hygiene.
```

- [ ] **Step 9: Tag and commit**

```bash
git add CHANGELOG.md
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "chore: M0 milestone complete — release 0.1.0-m0"
git tag -a v0.1.0-m0 -m "M0: Repo scaffold complete"
```

---

## Done — Milestone Acceptance Criteria

When this plan is fully executed, you should be able to truthfully tick:

- [ ] `make dev` brings up all services and they're healthy
- [ ] `make test` runs and passes (backend + frontend)
- [ ] `make migrate` applies Django migrations cleanly
- [ ] `make contracts` regenerates OpenAPI + TS types with no manual editing
- [ ] `make lint` is clean (ruff, biome, tsc)
- [ ] `make build` produces production Docker images
- [ ] CI workflow file is in place and (if pushed) green
- [ ] Pre-commit hooks pass on all files
- [ ] Tag `v0.1.0-m0` exists
- [ ] No `TODO`/`TBD`/`FIXME` left in committed code

That is M0. Next milestone: **M1 — Identity + Org + RBAC + Audit** — written as a separate plan when M0 is shipped.
