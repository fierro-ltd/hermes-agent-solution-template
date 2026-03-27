# Architecture

> High-level architecture of the Hermes Agent Solution Template (HAST) -- a production-ready template for building AI agent workflows with durable orchestration and human-in-the-loop review.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Container Responsibilities](#container-responsibilities)
- [Communication Patterns](#communication-patterns)
- [Data Flow](#data-flow)
- [SSE Streaming Architecture](#sse-streaming-architecture)
- [Agent Trace Capture](#agent-trace-capture)
- [LibreChat Integration](#librechat-integration)
- [Demo: Grading Workflow Sequence](#demo-grading-workflow-sequence)
- [Technology Choices](#technology-choices)
- [Security Model](#security-model)
- [Scalability Considerations](#scalability-considerations)
- [See Also](#see-also)

---

## System Overview

The Hermes Agent Solution Template (HAST) is composed of **nine Docker containers** that together provide the infrastructure for AI agent workflows with human-in-the-loop review. The template ships with an exam grading demo: professors upload student submissions through a React frontend, a Temporal workflow orchestrates the evaluation pipeline, the Hermes AI agent evaluates submissions against a configurable rubric (with real-time SSE streaming and agent trace visibility), and professors review the AI's suggested grades in a split-view UI before approving, rejecting, or requesting re-evaluation.

The grading demo showcases the template's core pattern -- **AI evaluate → human review → approve/reject** -- which generalizes to any domain (document review, code review, content moderation, etc.).

The template follows a **microservices architecture** with clear separation of concerns:

- **Frontend + API** are bundled into a single container (FastAPI serves the built React SPA)
- **Orchestration** is handled by Temporal for durable, retryable workflows
- **AI evaluation** is isolated behind the Hermes Agent Gateway (port 8642), which exposes both `/v1/chat/completions` and `/v1/responses` endpoints with web, file, and vision tools
- **Real-time streaming** is provided via SSE: FastAPI proxies Hermes SSE output to the browser
- **Agent trace visibility** captures every reasoning step, tool call, and token usage from the agent
- **LibreChat** provides a dedicated chat UI connected to Hermes, backed by MongoDB for conversation storage
- **Authentication** is a standalone better-auth service
- **Data** lives in a single PostgreSQL instance with two logical databases, plus MongoDB for LibreChat

---

## Architecture Diagram

```mermaid
graph TB
    subgraph "Client"
        Browser["Browser<br/>(React SPA)"]
        LCBrowser["Browser<br/>(LibreChat UI)"]
    end

    subgraph "Docker Compose Network"
        subgraph "Application Layer"
            API["api<br/>FastAPI + Static Files<br/>:8000"]
            Auth["auth<br/>better-auth (Hono)<br/>:3100"]
            Worker["worker<br/>Temporal Worker"]
            LC["librechat<br/>LibreChat v0.8.4<br/>:3080"]
        end

        subgraph "Infrastructure Layer"
            Temporal["temporal<br/>Temporal Server<br/>:7233"]
            TemporalUI["temporal-ui<br/>Temporal Web UI<br/>:8233"]
            Hermes["hermes-gateway<br/>AI Agent Gateway<br/>:8642"]
            Postgres["postgres<br/>PostgreSQL 15<br/>:5432"]
            MongoDB["mongodb<br/>MongoDB 8.0<br/>:27017"]
            Caddy["Caddy<br/>Reverse Proxy<br/>:8080"]
        end
    end

    Browser -->|"HTTP :8000<br/>API + SPA"| API
    LCBrowser -->|"HTTP :8080<br/>Chat UI (via Caddy)"| Caddy
    Caddy -->|":3080"| LC

    API -->|"gRPC :7233<br/>Start workflows, signals"| Temporal
    API -->|"SQL :5432<br/>Submissions, reviews"| Postgres
    API -->|"SSE proxy :8642<br/>Stream evaluation"| Hermes

    Auth -->|"SQL :5432<br/>Users, sessions"| Postgres

    Worker -->|"gRPC :7233<br/>Poll tasks, report results"| Temporal
    Worker -->|"HTTP :8642<br/>Chat completions + responses"| Hermes
    Worker -->|"SQL :5432<br/>Update grades + trace"| Postgres

    Temporal -->|"SQL :5432<br/>Workflow state"| Postgres
    TemporalUI -->|"gRPC :7233"| Temporal

    LC -->|"HTTP :8642<br/>Chat completions"| Hermes
    LC -->|"MongoDB :27017<br/>Conversations"| MongoDB

    Hermes -->|"HTTPS<br/>LLM API"| LLM["External LLM Provider<br/>(OpenCode Go / OpenRouter)"]

    style Browser fill:#e1f5fe
    style LCBrowser fill:#e1f5fe
    style API fill:#fff3e0
    style Auth fill:#fff3e0
    style Worker fill:#fff3e0
    style LC fill:#fff3e0
    style Temporal fill:#f3e5f5
    style TemporalUI fill:#f3e5f5
    style Hermes fill:#e8f5e9
    style Postgres fill:#fce4ec
    style MongoDB fill:#fce4ec
    style LLM fill:#f5f5f5
```

---

## Container Responsibilities

| Container | Image / Build | Port | Purpose |
|---|---|---|---|
| **postgres** | `postgres:15` | `127.0.0.1:5432` | Single PostgreSQL instance hosting two databases: `temporal` (workflow state) and `app_db` (submissions, reviews, settings, auth tables). Initialized by `infra/shared/init-db.sql`. |
| **temporal** | `temporalio/auto-setup:1.24.2` | `127.0.0.1:7233` | Temporal Server for durable workflow orchestration. Auto-creates its own `temporal` database on first boot. Provides gRPC API for workflow management. |
| **temporal-ui** | `temporalio/ui:2.27.0` | `127.0.0.1:8233` | Web dashboard for inspecting workflows, viewing execution history, and debugging. Read-only visibility into the Temporal server. |
| **hermes-gateway** | Custom build (`services/hermes/Dockerfile`) | `127.0.0.1:8642` | Hermes Agent Gateway exposing OpenAI-compatible `/v1/chat/completions` and `/v1/responses` endpoints. Routes requests to the configured LLM provider (OpenCode Go for GLM-5, OpenRouter for vision via Gemini 3.1 Flash Lite). Equipped with web (Tavily), file, and vision tools. Personality defined in `SOUL.md`. |
| **auth** | Custom build (`services/auth/Dockerfile`) | `127.0.0.1:3100` | Standalone better-auth service (Hono + Node.js). Handles email+password signup/login, Google OAuth, and GitHub OAuth. Manages user, session, account, and verification tables. |
| **api** | Custom build (`services/api/Dockerfile`) | `127.0.0.1:8000` | FastAPI backend serving the React SPA (static files) and all `/api/*` endpoints. Connects to Postgres for data and Temporal for workflow management. Proxies SSE from Hermes for real-time streaming. All `/api` routes require authentication. |
| **worker** | Custom build (`services/workers/Dockerfile`) | None (internal) | Temporal worker process that polls the task queue and executes workflow activities. Calls Hermes `/v1/responses` for richer trace capture (falls back to `/v1/chat/completions`). Stores agent trace in `reviews.agent_trace`. |
| **mongodb** | `mongo:8.0` | `127.0.0.1:27017` | MongoDB 8.0 instance used exclusively by LibreChat for storing conversation history, messages, and user data. Not used by the main application. |
| **librechat** | `ghcr.io/danny-avila/librechat:v0.8.4` | `127.0.0.1:3080` | LibreChat v0.8.4 chat UI connected to the Hermes gateway. Served externally via Caddy on port 8080. Provides a full-featured chat interface for direct Hermes Agent interaction. |

---

## Communication Patterns

```mermaid
graph LR
    subgraph "Synchronous (HTTP/gRPC)"
        A1["Browser → API"] -->|"REST/HTTP"| A2["JSON responses"]
        B1["API → Temporal"] -->|"gRPC"| B2["Start/signal workflows"]
        C1["Worker → Hermes"] -->|"HTTP POST"| C2["Chat completions / responses"]
        D1["Worker → Temporal"] -->|"gRPC"| D2["Poll/complete activities"]
        E1["LibreChat → Hermes"] -->|"HTTP POST"| E2["Chat completions"]
    end

    subgraph "Streaming (SSE)"
        F1["Browser → API"] -->|"GET /stream"| F2["SSE proxy → Hermes"]
        F2 -->|"token events"| F3["Live streaming panel"]
    end

    subgraph "Data Access (SQL / NoSQL)"
        G1["API → Postgres"] -->|"asyncpg"| G2["app_db"]
        H1["Auth → Postgres"] -->|"pg (node)"| H2["app_db"]
        I1["Worker → Postgres"] -->|"asyncpg"| I2["app_db"]
        J1["Temporal → Postgres"] -->|"internal"| J2["temporal db"]
        K1["LibreChat → MongoDB"] -->|"mongoose"| K2["librechat db"]
    end
```

### Protocol Summary

| From | To | Protocol | Purpose |
|---|---|---|---|
| Browser | API (`:8000`) | HTTP REST | SPA assets, submission CRUD, review decisions, settings, stats |
| Browser | API (`:8000`) | HTTP SSE | Real-time evaluation streaming (`/stream` endpoint) |
| API | Auth (`:3100`) | HTTP REST | Auth proxy (`/api/auth/*`) |
| API | Temporal (`:7233`) | gRPC | Start grading workflows, send review signals |
| API | Postgres (`:5432`) | TCP (asyncpg) | Read/write submissions, reviews, settings |
| API | Hermes (`:8642`) | HTTP SSE | Proxy streaming evaluation to browser |
| Worker | Temporal (`:7233`) | gRPC | Poll task queue, report activity results |
| Worker | Hermes (`:8642`) | HTTP POST | Send rubric + submission for AI evaluation; capture trace |
| Worker | Postgres (`:5432`) | TCP (asyncpg) | Update submission status, insert review + trace records |
| Auth | Postgres (`:5432`) | TCP (pg) | Manage user, session, account tables |
| Temporal | Postgres (`:5432`) | TCP (internal) | Persist workflow execution state |
| LibreChat | Hermes (`:8642`) | HTTP POST | Chat completions for direct agent interaction |
| LibreChat | MongoDB (`:27017`) | TCP (mongoose) | Persist conversation history |
| Hermes | External LLM | HTTPS | Forward inference to OpenCode Go (GLM-5) and OpenRouter (vision) |

---

## Data Flow

The following diagram shows the complete lifecycle of a submission from upload through grading to final approval.

```mermaid
flowchart TD
    A["Professor uploads submission<br/>(title, student name, content/file)"] --> B["API persists to submissions table<br/>status = 'pending'"]
    B --> C["API starts Temporal GradingWorkflow<br/>status = 'evaluating'"]
    C --> D["Worker picks up evaluate_submission activity"]
    D --> E["Worker reads rubric from app_settings"]
    E --> F["Worker calls Hermes /v1/responses<br/>with rubric + content"]
    F --> G["Hermes routes to LLM provider<br/>with web/file/vision tools available"]
    G --> H["LLM returns structured JSON feedback<br/>+ full agent trace (steps, tool calls, tokens)"]
    H --> I["Worker parses response,<br/>inserts review record + agent_trace in DB"]
    I --> J["Worker runs notify_reviewer activity<br/>status = 'review'"]
    J --> K["Workflow waits for review_signal<br/>(up to 7 days)"]

    K --> L{Professor decision?}
    L -->|"Approve"| M["Worker runs record_final_grade<br/>status = 'approved'"]
    L -->|"Reject"| N["Submission marked 'rejected'"]
    L -->|"Re-evaluate"| O["Loop back with feedback"]
    O --> D
    L -->|"No response (7 days)"| P["Workflow expires<br/>status = 'expired'"]

    M --> Q["Final grade recorded in reviews table"]

    style A fill:#e1f5fe
    style F fill:#e8f5e9
    style K fill:#fff3e0
    style L fill:#fff3e0
    style M fill:#c8e6c9
    style N fill:#ffcdd2
    style P fill:#f5f5f5
```

---

## SSE Streaming Architecture

The SSE streaming feature allows the browser to receive live token-by-token output from the Hermes agent during evaluation, displayed in a real-time streaming panel with react-markdown rendering.

```mermaid
sequenceDiagram
    participant Browser as React SPA
    participant API as FastAPI (:8000)
    participant Hermes as Hermes Gateway (:8642)
    participant LLM as LLM Provider

    Browser->>API: GET /api/submissions/{id}/stream
    Note over API: Opens SSE connection to browser
    API->>Hermes: POST /v1/chat/completions (stream=true)
    Hermes->>LLM: Forward request with streaming
    LLM-->>Hermes: Token stream
    Hermes-->>API: SSE token events
    API-->>Browser: SSE proxy (text/event-stream)
    Note over Browser: Streaming panel renders<br/>markdown in real time

    LLM-->>Hermes: [DONE]
    Hermes-->>API: SSE done event
    API-->>Browser: Connection closed
```

### SSE Event Format

Each SSE event proxied from Hermes follows the standard OpenAI streaming format:

```
data: {"choices":[{"delta":{"content":"The submission demonstrates..."},"index":0}]}

data: [DONE]
```

The browser streaming panel accumulates delta content and renders it with react-markdown for proper formatting of lists, bold text, and other markdown elements.

---

## Agent Trace Capture

The `/v1/responses` API (Hermes) returns richer execution metadata than `/v1/chat/completions`. The worker uses this endpoint to capture the full agent trace and store it in `reviews.agent_trace`.

```mermaid
flowchart TD
    A["Worker: evaluate_submission activity"] --> B{"Try /v1/responses"}
    B -->|"Success"| C["Parse response with trace metadata"]
    B -->|"Fallback"| D["Use /v1/chat/completions"]
    C --> E["Extract steps[], usage{}, session_id,<br/>duration_seconds, tools_used[], model"]
    D --> F["Extract feedback only, trace = null"]
    E --> G["Store review + agent_trace JSONB in DB"]
    F --> G

    G --> H["API: GET /api/submissions/{id}/trace"]
    H --> I["Return agent_trace JSON to frontend"]
    I --> J["Frontend: collapsible accordion<br/>(steps, tool calls, tokens, timestamps)"]
```

### Trace JSONB Schema

The `agent_trace` column in the `reviews` table stores:

```json
{
  "session_id": "sess_abc123",
  "model": "glm-5",
  "duration_seconds": 12.4,
  "tools_used": ["web_search", "file_read"],
  "usage": {
    "input_tokens": 1842,
    "output_tokens": 347,
    "total_tokens": 2189
  },
  "steps": [
    {
      "type": "reasoning",
      "content": "I need to evaluate this submission against the rubric...",
      "timestamp": "2026-03-27T10:30:01Z"
    },
    {
      "type": "tool_call",
      "tool": "web_search",
      "input": {"query": "Industrial Revolution primary sources"},
      "output": "...",
      "timestamp": "2026-03-27T10:30:03Z"
    },
    {
      "type": "output",
      "content": "{\"suggested_score\": 82.5, ...}",
      "timestamp": "2026-03-27T10:30:12Z"
    }
  ]
}
```

---

## LibreChat Integration

LibreChat provides a full-featured chat UI for direct interaction with the Hermes Agent, separate from the grading workflow.

```mermaid
graph TB
    User["User (Browser)"]
    Caddy["Caddy :8080"]
    LC["librechat :3080"]
    Hermes["hermes-gateway :8642"]
    MongoDB["mongodb :27017"]
    LLM["External LLM Provider"]

    User -->|"HTTP :8080"| Caddy
    Caddy -->|"proxy :3080"| LC
    LC -->|"POST /v1/chat/completions"| Hermes
    LC -->|"Store conversations"| MongoDB
    Hermes -->|"HTTPS"| LLM

    style User fill:#e1f5fe
    style LC fill:#fff3e0
    style Hermes fill:#e8f5e9
    style MongoDB fill:#fce4ec
```

LibreChat is configured to use the Hermes gateway as its LLM backend via the `LIBRECHAT_HERMES_URL` and `LIBRECHAT_HERMES_KEY` environment variables. This means all Hermes tools (web search via Tavily, file operations, vision via OpenRouter Gemini) are available through the LibreChat chat interface.

---

## Demo: Grading Workflow Sequence

```mermaid
sequenceDiagram
    actor Professor
    participant Browser as React SPA
    participant API as FastAPI
    participant Temporal as Temporal Server
    participant Worker as Temporal Worker
    participant Hermes as Hermes Gateway
    participant LLM as LLM Provider
    participant DB as PostgreSQL

    Professor->>Browser: Upload submission
    Browser->>API: POST /api/submissions (multipart form)
    API->>DB: INSERT INTO submissions (status='pending')
    API->>DB: SELECT rubric FROM app_settings
    API->>Temporal: StartWorkflow("GradingWorkflow", params)
    API->>DB: UPDATE submissions SET status='evaluating'
    API-->>Browser: 201 Created (submission response)

    Temporal->>Worker: Schedule evaluate_submission activity
    Worker->>DB: SELECT provider settings from app_settings
    Worker->>Hermes: POST /v1/responses (rubric + content)
    Hermes->>LLM: Forward request to configured provider
    Note over Hermes: May invoke web/file/vision tools
    LLM-->>Hermes: Structured JSON response + trace
    Hermes-->>Worker: Response with steps, usage, tools_used
    Worker->>DB: UPDATE submissions SET status='review'
    Worker->>DB: INSERT INTO reviews (agent_feedback, suggested_score, agent_trace)
    Worker-->>Temporal: Activity complete (AgentFeedback)

    Temporal->>Worker: Schedule notify_reviewer activity
    Worker->>DB: UPDATE submissions SET status='review'
    Worker-->>Temporal: Activity complete

    Note over Temporal: Workflow waits up to 7 days for review_signal

    Professor->>Browser: Open submission
    Browser->>API: GET /api/submissions/{id}/stream
    API-->>Browser: SSE streaming panel (live evaluation output)
    Browser->>API: GET /api/submissions/{id}/trace
    API-->>Browser: Agent trace (accordion: steps, tools, tokens)

    Professor->>Browser: Click "Approve" (optional score override)
    Browser->>API: POST /api/submissions/{id}/review
    API->>DB: INSERT INTO reviews (decision='approved')
    API->>Temporal: Signal workflow "review_signal"
    API->>DB: UPDATE submissions SET status='approved'
    API-->>Browser: 201 Created (review response)

    Temporal->>Worker: Resume workflow, schedule record_final_grade
    Worker->>DB: UPDATE reviews SET final_score, decided_at
    Worker->>DB: UPDATE submissions SET status='approved'
    Worker-->>Temporal: Activity complete
    Note over Temporal: Workflow completes with GradingResult
```

---

## Technology Choices

### Why Temporal?

**Problem:** Human-in-the-loop workflows are long-running (the demo waits up to 7 days for professor review) and must survive server restarts, network failures, and container re-deployments.

**Why Temporal solves this:**
- **Durability:** Workflow state is persisted to Postgres. If the worker crashes mid-evaluation, it resumes exactly where it left off after restart.
- **Signals:** The `review_signal` mechanism lets the API inject a professor's decision into a waiting workflow without polling or complex state management.
- **Retry policies:** The `evaluate_submission` activity has automatic retries (3 attempts, exponential backoff from 10s to 60s) if the LLM call fails.
- **Timeouts:** The 7-day review timeout is a first-class Temporal feature -- no cron jobs or schedulers needed.
- **Visibility:** The Temporal UI (`:8233`) provides full execution history for debugging.

### Why Hermes Agent Gateway?

**Problem:** The template needs to call different LLM providers with a consistent interface, configurable persona, and tool use capabilities.

**Why Hermes solves this:**
- **OpenAI-compatible API:** Exposes standard `/v1/chat/completions` and `/v1/responses` endpoints so worker code doesn't need provider-specific logic.
- **Provider abstraction:** Switch LLM providers by changing `HERMES_MODEL_PROVIDER` -- no code changes.
- **Tool use:** Built-in web search (Tavily), file operations, and vision (OpenRouter Gemini 3.1 Flash Lite) tools available to the agent.
- **Trace capture:** The `/v1/responses` endpoint returns detailed execution metadata (steps, tool calls, token usage) for agent trace visibility.
- **SOUL.md personality:** The agent's behavior is defined in a markdown file, not hardcoded.
- **Self-hosted:** Runs as a Docker container with its own API key authentication.

### Why LibreChat + MongoDB?

**Problem:** Users need a way to interact directly with the Hermes Agent outside the grading workflow, for prompt exploration and tool testing.

**Why LibreChat solves this:**
- **Full-featured chat UI:** Conversation history, message formatting, file attachments -- all out of the box.
- **OpenAI-compatible:** Connects to Hermes with no custom integration code.
- **MongoDB persistence:** LibreChat manages its own conversation store in MongoDB.
- **Isolation:** LibreChat and MongoDB don't touch the main application database.

### Why better-auth?

**Problem:** Need self-hosted authentication with email+password and OAuth support without vendor lock-in.

**Why better-auth solves this:**
- **Self-hosted:** All auth data stays in the template's own Postgres database.
- **Multiple providers:** Email+password always available; Google and GitHub OAuth configurable via env vars.
- **Session-based:** Uses database-backed sessions with cookies and Bearer tokens.
- **Lightweight:** Runs as a small Hono (Node.js) server on port 3100.
- **React integration:** `@better-auth/react` provides `useSession()` and auth client hooks.

### Why FastAPI + React?

- **FastAPI:** Async-native Python with Pydantic validation, OpenAPI docs, excellent asyncpg/Temporal SDK support, and native SSE support via `StreamingResponse`.
- **React (Vite + TanStack):** Modern SPA with file-based routing (TanStack Router), server-state management (TanStack Query), and the shadcn/ui component library.
- **react-markdown:** Used in the streaming panel to render markdown formatted output from the agent in real time.
- **Bundled deployment:** The Vite build output is served by FastAPI as static files, eliminating the need for a separate frontend container or nginx.

---

## Security Model

### Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser as React SPA
    participant Auth as Auth Service (:3100)
    participant API as FastAPI (:8000)
    participant DB as PostgreSQL

    User->>Browser: Enter email + password
    Browser->>Auth: POST /api/auth/sign-in
    Auth->>DB: Validate credentials, create session
    Auth-->>Browser: Set cookie "better-auth.session_token"

    Browser->>API: GET /api/submissions (with cookie)
    API->>DB: SELECT session WHERE token=$1 AND expiresAt > NOW()
    DB-->>API: Session + user data
    API-->>Browser: 200 OK (data)
```

### Key Security Properties

| Aspect | Implementation |
|---|---|
| **Session verification** | FastAPI reads `better-auth.session_token` cookie or `Authorization: Bearer <token>` header. Validates directly against the `session` table joined with `user`. |
| **Dev mode bypass** | When `AUTH_SECRET` is not set, `verify_auth()` returns a dev user (`dev@localhost`). This is intentional for local development. The frontend still requires sign-in through the auth service. |
| **API key protection** | Hermes API key is never returned in full. The `/api/settings/provider` endpoint returns only `api_key_set: bool` and `api_key_hint: "****last4"`. Direct writes to provider key settings via `/api/settings/{key}` are blocked. |
| **Port binding** | All Docker ports are bound to `127.0.0.1` only (e.g., `127.0.0.1:8000:8000`), preventing external access without a reverse proxy. |
| **CORS** | Configured for `localhost:5173` (Vite dev), `localhost:8000` (Docker), plus any `CORS_ORIGINS` env var entries. Production adds `https://{SITE_DOMAIN}`. |
| **SQL injection** | All database queries use parameterized queries via asyncpg (`$1`, `$2`, etc.). No string interpolation in SQL. |
| **OAuth** | Google and GitHub OAuth are optional. If env vars are empty, the provider is disabled in better-auth. Callback URLs must be configured in the respective developer consoles. |

---

## Scalability Considerations

| Component | Current Design | Scaling Path |
|---|---|---|
| **API** | Single container | Horizontal: run multiple API containers behind a load balancer. Session validation is stateless (DB lookup). |
| **Worker** | Single container | Horizontal: run multiple worker containers. Temporal distributes activities across workers automatically. |
| **Postgres** | Single instance, two databases | Vertical: increase resources. For high scale, separate Temporal DB from app DB onto different instances. |
| **Hermes** | Single container | Horizontal: run multiple Hermes instances behind a load balancer. Each is stateless. |
| **Temporal** | Single server (auto-setup) | Production: deploy Temporal cluster with separate history, matching, and frontend services. |
| **Auth** | Single container | Horizontal: stateless (DB-backed sessions). Run multiple behind a load balancer. |
| **MongoDB** | Single instance | Horizontal: MongoDB replica set for high availability. |
| **LibreChat** | Single container | Horizontal: stateless, run multiple behind a load balancer (shared MongoDB). |
| **File uploads** | Docker volume (`upload_data`) | Move to S3/MinIO for multi-node deployments. |

---

## Temporal Activity Design

The Temporal activities in this template follow AI agent best practices for reliability and efficiency. This section explains the key design decisions.

### Why activities are split (LLM call vs DB write)

The `evaluate_submission` activity (LLM call) and `persist_review` activity (DB write) are separate activities rather than a single combined operation. This matters because:

- **LLM calls are expensive and slow.** If a single activity performed both the LLM call and the DB write, a crash after the LLM response but before the DB commit would require re-running the entire LLM inference on retry. With separate activities, only the cheap DB write is retried.
- **Different retry characteristics.** LLM calls may fail due to rate limits or provider outages (retryable with backoff). DB writes may fail due to connection issues (retryable quickly). Separating them allows each activity to have its own retry policy tuned to its failure mode.
- **Idempotency is easier to guarantee.** The DB write activity uses deterministic review IDs and ON CONFLICT upserts, making it safe to retry. The LLM call activity is inherently non-idempotent (each call may produce different output), so minimizing unnecessary re-calls is important.

### Heartbeat pattern for long-running LLM calls

LLM inference can take 30-60 seconds. Without heartbeats, Temporal cannot distinguish between "the activity is still running" and "the worker crashed." The `evaluate_submission` activity sends heartbeats every 10 seconds while waiting for the LLM response.

This enables a `heartbeat_timeout` of 30 seconds -- if three consecutive heartbeats are missed, Temporal assumes the worker is dead and reschedules the activity. Without heartbeats, crash detection would depend on the full `start_to_close_timeout` (2 minutes), leaving the workflow stalled for much longer.

### Error classification for retry correctness

Not all errors should be retried. The activities classify HTTP errors into two categories:

| Error Type | HTTP Status | Retryable? | Rationale |
|---|---|---|---|
| Rate limit | 429 | Yes | Provider is temporarily overloaded; respect `Retry-After` header |
| Server error | 5xx | Yes | Transient infrastructure failure; likely to resolve on retry |
| Client error | 4xx (not 429) | No | Bad request, auth failure, or invalid input; retrying will not help |

Client errors are raised as `ApplicationError(non_retryable=True)`, which tells Temporal to fail the activity immediately without consuming remaining retry attempts. This prevents wasting time and API quota on requests that will never succeed.

### Data passing strategy (DB reference vs payload)

Activities receive `submission_id` rather than the full submission content. The activity fetches the content from PostgreSQL at execution time. This design choice has three benefits:

1. **Small event history.** Temporal persists every activity input in its event history. Passing a UUID (36 bytes) instead of a full essay (potentially hundreds of KB) keeps the history compact and fast to replay.
2. **Avoids payload limits.** Temporal has a default 2MB payload limit. Large submissions or file attachments could exceed this if passed directly.
3. **Fresh data.** If submission content is updated between retries (unlikely but possible), the activity always reads the latest version from the database.

---

## See Also

- [API Reference](./API.md) -- Complete endpoint documentation including SSE stream and trace endpoints
- [Deployment Guide](./DEPLOYMENT.md) -- Local and production setup
- [Workflows](./WORKFLOWS.md) -- Temporal workflow deep dive with trace capture
- [Data Model](./DATA_MODEL.md) -- Database schema reference including agent_trace and MongoDB
- [Customization](./CUSTOMIZATION.md) -- How to fork and adapt the template, configure Hermes tools
