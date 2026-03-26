# Hermes Agent Solution Template (HAST) -- Design Specification

**Date:** 2026-03-26
**Status:** Approved

## Overview

The Hermes Agent Solution Template (HAST) is a production-ready template for building AI agent workflows with durable orchestration and human-in-the-loop review. It ships with an exam grading demo: professors upload student exam submissions through a web interface, an AI agent evaluates them against a configurable rubric, and professors review and finalize grades through a human-in-the-loop workflow. The template's core pattern -- AI evaluate → human review → approve/reject -- generalizes to any domain.

## Architecture

The template runs as 6 Docker containers orchestrated via Docker Compose:

| Container | Role |
|---|---|
| **postgres** | PostgreSQL 15 -- persistent storage for submissions, reviews, and settings |
| **temporal** | Temporal Server (auto-setup 1.24.2) -- durable workflow orchestration |
| **temporal-ui** | Temporal Web UI -- workflow visibility and debugging |
| **hermes-gateway** | Hermes Agent Gateway -- AI grading agent with OpenAI-compatible API |
| **api** | FastAPI application serving the React frontend and REST endpoints |
| **worker** | Temporal worker executing grading workflow activities |

```
                         +------------------+
                         |   Web Browser    |
                         +--------+---------+
                                  |
                         +--------v---------+
                         |   api (FastAPI   |
                         |   + React SPA)   |
                         +---+---------+----+
                             |         |
                    +--------v--+  +---v-----------+
                    | postgres  |  | temporal       |
                    +-----------+  +---+-----------+
                                       |
                                +------v-------+
                                |   worker     |
                                +------+-------+
                                       |
                                +------v-----------+
                                | hermes-gateway   |
                                +------------------+
```

## Demo: Grading Workflow

The included grading demo implements a Temporal workflow (`GradingWorkflow`) that showcases the template's core evaluate → review → approve pattern:

1. **Submission Upload:** Professor uploads an exam submission (text or file) via the Web UI.
2. **Persist Submission:** FastAPI stores the submission in the `submissions` table and starts a `GradingWorkflow` in Temporal.
3. **AI Evaluation Activity:** The worker executes an activity that calls Hermes at `/v1/chat/completions` with the rubric and submission content.
4. **Structured Response:** The agent returns a structured JSON response:
   ```json
   {
     "suggested_score": 85,
     "strengths": [
       "Clear thesis statement with supporting evidence",
       "Proper use of citations throughout"
     ],
     "weaknesses": [
       "Section 3 lacks depth on the counterargument",
       "Missing conclusion paragraph"
     ],
     "reasoning": "The submission demonstrates strong analytical skills..."
   }
   ```
5. **Store Review:** The activity persists the agent feedback as a `reviews` record with status `pending_review`.
6. **Professor Notification:** The submission status updates to `reviewed`, visible in the Web UI.
7. **Await Decision Signal:** The workflow enters a signal wait (up to 7 days) for the professor's decision.
8. **Professor Action:** The professor reviews the AI evaluation in the Web UI split-view and takes one of three actions:
   - **Approve** -- Accepts the suggested score (with optional override) and finalizes the grade.
   - **Reject** -- Discards the AI evaluation. The submission returns to ungraded status.
   - **Request Re-evaluation** -- Provides feedback to the agent. The workflow loops back to step 3 with the professor's notes appended to the prompt.
9. **Finalization:** The final grade is recorded in the `reviews` table with the professor's decision and any notes.

### Workflow Timeout

If no professor action is received within 7 days, the workflow completes with status `expired`. The review remains accessible but requires manual grading.

## Data Model

### submissions

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated identifier |
| title | TEXT | Submission title or exam name |
| student_name | TEXT | Student identifier |
| content | TEXT | Submission text content (for inline submissions) |
| file_path | TEXT | Path to uploaded file (for file submissions) |
| status | TEXT | `pending`, `grading`, `reviewed`, `approved`, `rejected`, `expired` |
| workflow_id | TEXT | Temporal workflow ID for tracking |
| created_at | TIMESTAMPTZ | Submission upload time |
| updated_at | TIMESTAMPTZ | Last status change |

### reviews

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated identifier |
| submission_id | UUID (FK) | Reference to submissions table |
| agent_feedback | JSONB | Structured AI response (suggested_score, strengths, weaknesses, reasoning) |
| suggested_score | NUMERIC(5,2) | AI-suggested score extracted for indexing |
| final_score | NUMERIC(5,2) | Professor-confirmed final score |
| professor_notes | TEXT | Professor comments or re-evaluation feedback |
| decision | TEXT | `pending_review`, `approved`, `rejected`, `re_evaluate` |
| created_at | TIMESTAMPTZ | Review creation time |
| updated_at | TIMESTAMPTZ | Last update time |

### app_settings

| Column | Type | Description |
|---|---|---|
| id | INTEGER (PK) | Singleton row (CHECK id = 1) |
| settings | JSONB | Application settings including rubric configuration, hermes config |
| updated_at | TIMESTAMPTZ | Last settings update |

Default rubric stored in `settings.rubric`:
```json
{
  "rubric": {
    "name": "Default Grading Rubric",
    "max_score": 100,
    "criteria": [
      {"name": "Content & Accuracy", "weight": 40, "description": "Correctness of facts, depth of analysis, and relevance to the prompt."},
      {"name": "Structure & Organization", "weight": 25, "description": "Logical flow, clear paragraphs, introduction and conclusion."},
      {"name": "Critical Thinking", "weight": 20, "description": "Original insights, evaluation of multiple perspectives, evidence-based reasoning."},
      {"name": "Writing Quality", "weight": 15, "description": "Grammar, clarity, academic tone, proper citations."}
    ]
  }
}
```

## Web UI Pages

### Dashboard (`/`)

Overview statistics:
- Total submissions count
- Submissions pending review
- Average score across graded submissions
- Recent activity feed

### Submissions List (`/submissions`)

- Table of all submissions with status, student name, score, and timestamps
- Upload button to submit a new exam (text input or file upload)
- Filter by status, search by student name
- Sort by date, score, or status

### Submission Detail (`/submissions/:id`)

Split-view review page:
- **Left panel:** Original submission content (text or rendered file)
- **Right panel:** AI evaluation with strengths, weaknesses, reasoning, and suggested score
- Action buttons: Approve (with optional score override input), Reject, Request Re-evaluation (with feedback text area)
- Review history showing all evaluation rounds

### Settings (`/settings`)

- Rubric editor with criteria management (add, remove, reorder, adjust weights)
- Hermes configuration (model provider, max turns)
- System status indicators

## Hermes Configuration

The Hermes agent is configured as a single-purpose grading assistant:

- **Model provider:** Configurable via environment variable (`HERMES_MODEL_PROVIDER`), defaults to Anthropic
- **API server:** Enabled, serving OpenAI-compatible completions at `/v1/chat/completions`
- **Toolsets:** Limited to `[web]` for citation verification
- **Max turns:** 10 per evaluation
- **STT:** Disabled (text-only grading)
- **SOUL.md:** Persona focused on structured grading feedback with fair evaluation standards

## Paperclip Integration (Future)

The architecture supports adding Paperclip (document processing and parsing) via a `hermes-paperclip-adapter` service. This would:

- Accept file uploads from the API service
- Parse PDFs, images, and handwritten submissions into structured text
- Feed parsed content to the Hermes grading agent
- Sit between the API and Hermes as a preprocessing layer

No code changes are needed in the core workflow; the adapter would implement the same `/v1/chat/completions` interface, wrapping Hermes with document preprocessing.

## Security Considerations

- All Docker ports bound to `127.0.0.1` only (no external exposure without reverse proxy)
- Database credentials managed via environment variables
- Hermes API key required for agent communication
- JWT-based authentication via Clerk (JWKS verification)
- File uploads stored in a named Docker volume with restricted access

## Deployment

- **Local development:** `docker compose up` with `.env` configuration
- **Production (Hetzner):** Docker Compose with Caddy reverse proxy for TLS termination
- Single-server deployment; horizontal scaling via additional worker containers
