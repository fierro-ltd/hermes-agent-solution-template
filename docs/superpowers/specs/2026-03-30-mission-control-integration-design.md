# Mission Control Integration — Design Spec

**Date:** 2026-03-30
**Version target:** v0.15.0
**Status:** Approved

## Overview

Integrate [Mission Control](https://github.com/builderz-labs/mission-control) (v2.0.1) as the observability and control dashboard for Hermes Agent within the HAST stack. MC provides agent registration, session monitoring, token cost tracking, and configuration control via a self-hosted Next.js UI backed by SQLite.

This adds container #10 to the stack and introduces a shared Docker volume between Hermes and MC for real-time session visibility and hook-based telemetry.

## Architecture

```
Browser
  ├── :443  → Caddy → FastAPI :8000  (HAST app)
  ├── :8080 → Caddy → LibreChat :3080
  ├── :9233 → Caddy → Temporal UI :8233
  └── :3001 → Caddy → Mission Control :3000  ← NEW
```

### Container Topology

- **mission-control** — `ghcr.io/builderz-labs/mission-control:latest`, port 3000 internal / 3001 external
- **hermes-gateway** — Existing container, gains a shared volume mount
- **worker** — Existing container, gains MC token reporting

### Volumes

| Volume | Mounted in | Mount path | Mode | Purpose |
|--------|-----------|------------|------|---------|
| `hermes_data` | hermes-gateway | `/root/.hermes` | rw | Hermes home directory (state.db, config, hooks) |
| `hermes_data` | mission-control | `/hermes-data` | ro | MC reads state.db, config.yaml, SOUL.md |
| `mc_data` | mission-control | `/app/.data` | rw | MC's own SQLite database and settings |

### Data Flow

```
Hermes Agent
  ├── writes state.db (sessions, tool calls, tokens)
  ├── executes hooks/mission-control/handler.py on events
  │     └── POST /api/agents/register, /api/hermes/events → MC
  └── reads hooks/mission-control/HOOK.yaml for event config

Mission Control
  ├── reads /hermes-data/state.db (session scanner, read-only)
  ├── reads /hermes-data/config.yaml, SOUL.md (config viewer)
  └── receives POST /api/tokens from HAST worker

HAST Worker
  └── POST /api/tokens → MC (after each grading evaluation)
```

## Docker Compose Changes

### New Service

```yaml
mission-control:
  image: ghcr.io/builderz-labs/mission-control:latest
  ports:
    - "127.0.0.1:3001:3000"
  environment:
    - MC_ALLOW_ANY_HOST=true
    - NEXT_PUBLIC_GATEWAY_OPTIONAL=true
    - AUTH_USER=${MC_AUTH_USER:-admin}
    - AUTH_PASS=${MC_AUTH_PASS:-}
    - API_KEY=${MC_API_KEY:-}
  volumes:
    - mc_data:/app/.data
    - hermes_data:/hermes-data:ro
  depends_on:
    hermes-gateway:
      condition: service_healthy
```

### Modified hermes-gateway Service

Add shared volume and MC env vars:

```yaml
hermes-gateway:
  volumes:
    - hermes_data:/root/.hermes
  environment:
    # ... existing vars ...
    - MC_URL=http://mission-control:3000
    - MC_API_KEY=${MC_API_KEY:-}
```

### Modified worker Service

Add MC env vars:

```yaml
worker:
  environment:
    # ... existing vars ...
    - MC_URL=http://mission-control:3000
    - MC_API_KEY=${MC_API_KEY:-}
```

### New Volumes

```yaml
volumes:
  hermes_data:
  mc_data:
```

## Hermes Hook Integration

Pre-installed in the Hermes Docker image (not written at runtime by MC). Two files in `services/hermes/hooks/mission-control/`:

### HOOK.yaml

```yaml
name: mission-control
events:
  - agent:start
  - agent:end
  - session:start
```

### handler.py

Python script using `httpx` (available in Hermes's venv) that:

- On `agent:start`: `POST /api/agents/register` with `name=hermes-grader`, `role=agent`, `capabilities=["grading", "vision"]`, `framework=generic`
- On `agent:end`: Updates agent status to idle
- On `session:start`: Reports session metadata (model, source, session_id)
- Reads `MC_URL` and `MC_API_KEY` from environment variables
- Fails silently with a 3-second timeout if MC is unreachable

### Dockerfile Change

```dockerfile
COPY services/hermes/hooks/mission-control/ /root/.hermes/hooks/mission-control/
```

## Worker Token Reporting

Minimal addition to `services/workers/activities/grading.py`. After each `evaluate_submission` activity completes, report token usage to MC.

### Helper Function

```python
async def _report_to_mission_control(trace_data: dict, submission_id: str) -> None:
    """Fire-and-forget token usage report to Mission Control."""
    mc_url = os.environ.get("MC_URL")
    mc_api_key = os.environ.get("MC_API_KEY")
    if not mc_url or not mc_api_key:
        return
    usage = trace_data.get("usage", {})
    payload = {
        "model": trace_data.get("model", "unknown"),
        "session_id": f"grading-{submission_id}",
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{mc_url}/api/tokens",
                json=payload,
                headers={"x-api-key": mc_api_key},
            )
    except Exception:
        pass  # MC being down must not affect grading
```

### Call Site

Called after the Hermes API response is parsed and trace data is extracted, before persisting to Postgres. Uses data already available in `agent_trace`.

## Caddy Production Config

New entry in `infra/hetzner/Caddyfile`:

```
hermes-agent-solution-template.fierro.co.uk:3001 {
    reverse_proxy localhost:3000
}
```

## Frontend Nav Change

Add MC to the navbar in `frontend/src/components/nav-bar.tsx`:

```typescript
const mcUrl = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:3001`
  : ":3001";

// In the links array, after Chat, before Settings:
{ to: mcUrl, label: "Mission Control", external: true },
```

## Environment Variables

### New vars in `.env.example` and `.env`

```bash
# Mission Control
MC_AUTH_USER=admin
MC_AUTH_PASS=<pick-a-password>
MC_API_KEY=<generated-key-for-agent-and-worker-reporting>
```

Note: `MC_API_KEY` in `.env` maps to the `API_KEY` env var inside the MC container (see docker-compose snippet). The `MC_` prefix avoids collision with other services. The same `MC_API_KEY` value is passed to hermes-gateway and worker so they can authenticate when reporting to MC.

### Env var summary by container

| Container | New vars | Purpose |
|-----------|----------|---------|
| mission-control | `MC_ALLOW_ANY_HOST`, `NEXT_PUBLIC_GATEWAY_OPTIONAL`, `AUTH_USER`, `AUTH_PASS`, `API_KEY` | MC config |
| hermes-gateway | `MC_URL`, `MC_API_KEY` | Hook telemetry target |
| worker | `MC_URL`, `MC_API_KEY` | Token reporting target |

## Version Bump

Update to **v0.15.0** in:
- `frontend/package.json`
- `services/api/main.py` (FastAPI app version)
- `CLAUDE.md` (current version reference)

## Files Changed

| File | Change |
|------|--------|
| `infra/shared/docker-compose.yml` | Add MC service, shared volume, MC env vars to hermes-gateway and worker |
| `services/hermes/Dockerfile` | COPY hooks directory |
| `services/hermes/hooks/mission-control/HOOK.yaml` | New file — event declarations |
| `services/hermes/hooks/mission-control/handler.py` | New file — telemetry handler |
| `services/workers/activities/grading.py` | Add `_report_to_mission_control()` helper + call site |
| `infra/hetzner/Caddyfile` | Add `:3001` proxy block |
| `frontend/src/components/nav-bar.tsx` | Add Mission Control nav link |
| `infra/local/.env.example` | Add `MC_AUTH_USER`, `MC_AUTH_PASS`, `MC_API_KEY` |
| `frontend/package.json` | Version → 0.15.0 |
| `services/api/main.py` | Version → 0.15.0 |
| `CLAUDE.md` | Version → 0.15.0 |

## Out of Scope

- No Kanban/task sync with Temporal (Temporal owns orchestration)
- No rubric or score data pushed to MC (HAST's domain)
- No OpenClaw gateway (standalone mode)
- No changes to Hermes Agent source code or config.yaml
- No database schema changes in HAST's Postgres
