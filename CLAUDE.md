# Hermes Agent Solution Template (HAST) -- AI Assistant Context

## Project Overview

A production-ready solution template for building AI agent workflows with durable orchestration and human-in-the-loop review. Ships with an exam grading demo: professors upload student exam submissions, a Hermes AI agent evaluates them against a configurable rubric, and professors finalize grades through a Temporal-powered workflow. The template pattern (AI evaluate → human review → approve/reject) is generic and designed to be forked for other use cases.

Current version: **v0.1.0**

## Tech Stack

- **Frontend:** Vite + React, TypeScript, TanStack Router/Query, Tailwind CSS, shadcn/ui
- **Authentication:** better-auth (standalone Node.js auth service, `@better-auth/react` frontend, direct session table verification in FastAPI)
- **Backend API:** FastAPI, Python 3.11+
- **Orchestration:** Temporal.io 1.24.2
- **Database:** PostgreSQL 15 (single instance, two databases: temporal + app_db)
- **AI Agent:** Hermes Agent Gateway (OpenAI-compatible /v1/chat/completions endpoint)
- **Containers:** Docker + Docker Compose
- **Package Manager:** pnpm (frontend)

## Key Patterns

- **Frontend bundled into API container.** Vite builds to `dist/`, FastAPI serves static files + SPA fallback. No separate frontend Docker service. Dev server: `cd frontend && pnpm dev` (proxies API to :8000).
- **Temporal for durable workflows.** Submission processing, AI evaluation, and human review signals all use Temporal workflows for durability and retry. The grading demo showcases this pattern; it generalizes to any evaluate → review → approve workflow.
- **Hermes for AI evaluation.** Single-purpose agent constrained to structured JSON output. Config in `services/hermes/`. SOUL.md defines the persona.
- **Environment variable management:** `infra/shared/.env` is the canonical env file. Copy from `infra/local/.env.example`.
- **Docker Compose override:** Local dev mounts source directories for hot reload.
- **better-auth authentication.** All `/api` routes require a valid session (cookie or Bearer token). `/health` is exempt. Auth service runs on port 3100. Supports email+password, Google OAuth, and GitHub OAuth.
- **Database:** Single Postgres instance. `temporal` database created by auto-setup. `app_db` created by `init-db.sql` with submissions, reviews, app_settings, and auth tables (user, session, account, verification).

## Test Credentials (Local Dev)

Sign up on first run at `http://localhost:8000/login`, then use these for subsequent sessions:
- **Email:** `prof@test.edu`
- **Password:** `TestPassword123!`
- **Name:** `Professor Test`

In dev mode (no `AUTH_SECRET` set), the FastAPI backend bypasses auth — but the frontend still requires sign-in via the auth service.

## Commands

```bash
# Start all services locally
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               up --build

# Stop all services
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               down

# Frontend dev (with hot reload)
cd frontend && pnpm dev

# Tests
PYTHONPATH=.:src pytest tests/ -v
```

## Project Structure

- `src/edu_agent_platform/` -- Shared Python package (config, models, DB helpers)
- `services/api/` -- FastAPI backend (serves frontend static files in production)
- `services/workers/` -- Temporal workers + grading activities (demo workflow)
- `services/hermes/` -- Hermes agent Dockerfile, SOUL.md, config.yaml
- `frontend/` -- Vite + React SPA
- `infra/shared/` -- Base Docker Compose, SQL init, Temporal dynamic config
- `infra/local/` -- Local dev overrides + .env.example
- `infra/hetzner/` -- Production deployment scripts
- `docs/specs/` -- Design specifications
- `tests/` -- Test suite
- `scripts/` -- Utility scripts
- `sample_data/` -- Sample submissions for testing

## Coding Standards

- Python: ruff for linting (line-length 100, py311 target), mypy strict mode
- All Python config via frozen dataclasses reading from env vars at instantiation time
- Database queries use asyncpg with parameterized queries (no ORM)
- API responses use Pydantic models
- Temporal workflows and activities in separate modules
- All Docker ports bound to 127.0.0.1 only

## Data Model

Tables in app_db:
- `submissions` -- demo: exam submissions with status tracking and workflow_id
- `reviews` -- demo: AI feedback (JSONB), suggested/final scores, professor decision
- `app_settings` -- core template: singleton row with rubric config and hermes settings
- `user`, `session`, `account`, `verification` -- core template: better-auth tables for authentication

## Grading Workflow States (Demo)

submission status: pending -> grading -> reviewed -> approved/rejected/expired
review decision: pending_review -> approved/rejected/re_evaluate
