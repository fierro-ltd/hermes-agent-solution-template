# Hermes Agent Solution Template (HAST) -- AI Assistant Context

## Project Overview

A production-ready solution template for building AI agent workflows with durable orchestration and human-in-the-loop review. Ships with an exam grading demo: professors upload student exam submissions, a Hermes AI agent evaluates them against a configurable rubric, and professors finalize grades through a Temporal-powered workflow. The template pattern (AI evaluate → human review → approve/reject) is generic and designed to be forked for other use cases.

Current version: **v0.1.0**

## Tech Stack

- **Frontend:** Vite + React, TypeScript, TanStack Router/Query, Tailwind CSS, shadcn/ui, react-markdown
- **Authentication:** better-auth (standalone Node.js auth service, `@better-auth/react` frontend, direct session table verification in FastAPI)
- **Backend API:** FastAPI, Python 3.11+
- **Orchestration:** Temporal.io 1.24.2
- **Database:** PostgreSQL 15 (single instance, two databases: temporal + app_db)
- **AI Agent:** Hermes Agent Gateway (OpenAI-compatible API on port 8642; /v1/chat/completions and /v1/responses endpoints)
- **Chat UI:** LibreChat v0.8.4 (served via Caddy on port 8080, connects to Hermes)
- **Chat Storage:** MongoDB 8.0 (LibreChat conversation history)
- **Containers:** Docker + Docker Compose (9 containers total)
- **Package Manager:** pnpm (frontend)

## Key Patterns

- **Frontend bundled into API container.** Vite builds to `dist/`, FastAPI serves static files + SPA fallback. No separate frontend Docker service. Dev server: `cd frontend && pnpm dev` (proxies API to :8000).
- **Temporal for durable workflows.** Submission processing, AI evaluation, and human review signals all use Temporal workflows for durability and retry. The grading demo showcases this pattern; it generalizes to any evaluate → review → approve workflow. Temporal activities follow Temporal AI agent best practices: heartbeats during LLM calls, non-retryable error classification for 4xx, idempotent DB writes, content passed by reference not value, rate limit handling with Retry-After headers.
- **Hermes for AI evaluation.** Single-purpose agent with web (Tavily), file, and vision (OpenRouter Gemini 3.1 Flash Lite) tools. Config in `services/hermes/`. SOUL.md defines the persona. Uses `/v1/responses` API for richer trace capture with fallback to `/v1/chat/completions`.
- **SSE streaming.** `GET /api/submissions/{id}/stream` proxies Hermes SSE to the browser. The frontend streaming panel renders markdown in real time via react-markdown.
- **Agent trace visibility.** `evaluate_submission` activity captures the full agent execution trace (steps, tool calls, token usage, timing). Stored in `reviews.agent_trace` JSONB column. Frontend shows collapsible accordion with reasoning steps, tool calls, and token usage.
- **LibreChat integration.** LibreChat v0.8.4 provides a full chat UI for direct Hermes Agent interaction. Served via Caddy on port 8080, stores conversations in MongoDB.
- **Environment variable management:** `infra/shared/.env` is the canonical env file. Copy from `infra/local/.env.example`.
- **Docker Compose override:** Local dev mounts source directories for hot reload.
- **better-auth authentication.** All `/api` routes require a valid session (cookie or Bearer token). `/health` is exempt. Auth requests (`/api/auth/*`) are proxied through the FastAPI server to the internal auth service (port 3100 is not publicly exposed). Supports email+password, Google OAuth, and GitHub OAuth.
- **Database:** Single Postgres instance. `temporal` database created by auto-setup. `app_db` created by `init-db.sql` with submissions, reviews, app_settings, and auth tables (user, session, account, verification). `reviews` table includes `agent_trace JSONB DEFAULT NULL` column.

## Test Credentials (Local Dev)

Sign up on first run at `http://localhost:8000/login`, then use these for subsequent sessions:
- **Email:** `prof@test.edu`
- **Password:** `TestPassword123!`
- **Name:** `Professor Test`

In dev mode (no `AUTH_SECRET` set), the FastAPI backend bypasses auth -- but the frontend still requires sign-in via the auth service.

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

- `src/hermes_agent_solution_template/` -- Shared Python package (config, models, DB helpers)
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
- `reviews` -- demo: AI feedback (JSONB), suggested/final scores, professor decision, agent_trace (JSONB)
- `app_settings` -- core template: singleton row with rubric config and hermes settings
- `user`, `session`, `account`, `verification` -- core template: better-auth tables for authentication

MongoDB (LibreChat):
- Stores LibreChat conversation history, messages, and user data
- Managed entirely by LibreChat; do not interact with it directly

## API Endpoints

- `POST /api/submissions` — create submission + start workflow
- `GET /api/submissions` — list all submissions
- `GET /api/submissions/{id}` — get submission with latest review
- `GET /api/submissions/{id}/progress` — real-time Temporal activity tracking
- `GET /api/submissions/{id}/stream` — SSE streaming of Hermes evaluation
- `GET /api/submissions/{id}/trace` — agent execution trace
- `POST /api/submissions/{id}/review` — submit professor review decision
- `DELETE /api/submissions/{id}` — delete submission
- `GET /api/stats` — dashboard analytics
- `GET/PUT /api/settings` — app settings (rubric, model config)

## Grading Workflow States (Demo)

submission status: pending -> grading -> reviewed -> approved/rejected/expired
review decision: pending_review -> approved/rejected/re_evaluate

## Hermes Agent Configuration

- **Provider:** OpenCode Go (GLM-5)
- **Vision:** OpenRouter (Gemini 3.1 Flash Lite)
- **Tools:** web (Tavily web search), file, vision
- **API:** Exposes `/v1/chat/completions` and `/v1/responses` (used for trace capture)
- **Port:** 8642
