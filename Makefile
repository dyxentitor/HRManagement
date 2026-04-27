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
