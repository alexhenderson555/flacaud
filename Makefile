.PHONY: test lint e2e e2e-api build up down deploy hooks migrate migrate-stamp

hooks:
	git config core.hooksPath .githooks
	@echo "Installed .githooks/pre-commit (runs ruff + eslint before each commit)."

migrate:
	uv run alembic upgrade head

migrate-stamp:
	uv run alembic stamp head

test:
	uv run pytest tests/ -q -k "not remote_flow_live"

lint:
	uv run ruff check src tests scripts

e2e:
	cd frontend && npm run e2e

e2e-api:
	uv run python scripts/e2e_remote_flow.py

build:
	cd frontend && npm run build

up:
	docker compose up -d --build

down:
	docker compose down

deploy:
	python scripts/deploy_tidal.py
