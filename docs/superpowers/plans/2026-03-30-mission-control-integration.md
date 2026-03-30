# Mission Control Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mission Control as the observability and control dashboard for Hermes Agent (container #10), with shared volume for session scanning, pre-installed hooks for telemetry, and worker token reporting.

**Architecture:** MC runs as a standalone Next.js container (pre-built image) connected to Hermes via a shared Docker volume at `/root/.hermes`. The HAST worker reports token usage to MC's REST API after each evaluation. Caddy proxies MC on port 3001.

**Tech Stack:** Docker (pre-built ghcr.io image), Python (hook handler + worker reporting), TypeScript (nav link), Caddy (reverse proxy)

**Spec:** `docs/superpowers/specs/2026-03-30-mission-control-integration-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `infra/shared/docker-compose.yml` | Modify | Add MC service, shared volume, env vars |
| `services/hermes/Dockerfile` | Modify | COPY hooks directory into image |
| `services/hermes/hooks/mission-control/HOOK.yaml` | Create | Event declarations for Hermes hook system |
| `services/hermes/hooks/mission-control/handler.py` | Create | Python telemetry handler |
| `services/workers/activities/grading.py` | Modify | Add MC token reporting after evaluation |
| `infra/hetzner/Caddyfile` | Modify | Add :3001 proxy block |
| `frontend/src/components/nav-bar.tsx` | Modify | Add Mission Control nav link |
| `infra/local/.env.example` | Modify | Add MC env vars |
| `frontend/package.json` | Modify | Version → 0.15.0 |
| `services/api/main.py` | Modify | Version → 0.15.0 |
| `CLAUDE.md` | Modify | Version → 0.15.0 |

---

### Task 1: Docker Compose — MC service, shared volume, env vars

**Files:**
- Modify: `infra/shared/docker-compose.yml`

- [ ] **Step 1: Add `hermes_data` volume to the hermes-gateway service**

In `infra/shared/docker-compose.yml`, the hermes-gateway service (around line 52) currently has no volumes section. Add one after the `healthcheck` block (around line 73):

```yaml
    volumes:
      - hermes_data:/root/.hermes
```

Also add MC env vars to hermes-gateway's environment section (after line 67):

```yaml
      - MC_URL=http://mission-control:3000
      - MC_API_KEY=${MC_API_KEY:-}
```

- [ ] **Step 2: Add MC env vars to the worker service**

In the worker service environment section (around line 138), add after the existing env vars:

```yaml
      - MC_URL=http://mission-control:3000
      - MC_API_KEY=${MC_API_KEY:-}
```

- [ ] **Step 3: Add the mission-control service**

Add the new service before the `volumes:` section (before line 195):

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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 15s
      timeout: 5s
      retries: 3
```

- [ ] **Step 4: Add new volumes to the volumes section**

In the volumes section (around line 195), add:

```yaml
  hermes_data:
  mc_data:
```

- [ ] **Step 5: Verify docker-compose syntax**

Run: `docker compose -f infra/shared/docker-compose.yml config --quiet`
Expected: No output (valid config)

- [ ] **Step 6: Commit**

```bash
git add infra/shared/docker-compose.yml
git commit -m "feat: add Mission Control service with shared Hermes volume"
```

---

### Task 2: Hermes Hook — HOOK.yaml and handler.py

**Files:**
- Create: `services/hermes/hooks/mission-control/HOOK.yaml`
- Create: `services/hermes/hooks/mission-control/handler.py`

- [ ] **Step 1: Create the hooks directory**

```bash
mkdir -p services/hermes/hooks/mission-control
```

- [ ] **Step 2: Create HOOK.yaml**

Create `services/hermes/hooks/mission-control/HOOK.yaml`:

```yaml
name: mission-control
description: Sends telemetry to Mission Control dashboard
events:
  - agent:start
  - agent:end
  - session:start
```

- [ ] **Step 3: Create handler.py**

Create `services/hermes/hooks/mission-control/handler.py`:

```python
"""Mission Control telemetry hook for Hermes Agent.

Sends agent registration, status updates, and session events to
Mission Control's REST API. Fails silently if MC is unreachable.
"""

import os
import sys
import json


def main():
    mc_url = os.environ.get("MC_URL", "")
    mc_api_key = os.environ.get("MC_API_KEY", "")

    if not mc_url or not mc_api_key:
        return

    # Event name is passed as first argument by Hermes hook system
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    # Event data is passed as JSON on stdin
    try:
        data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except (json.JSONDecodeError, EOFError):
        data = {}

    try:
        import httpx
    except ImportError:
        # httpx not available — skip silently
        return

    headers = {"x-api-key": mc_api_key, "Content-Type": "application/json"}
    timeout = 3.0

    try:
        with httpx.Client(timeout=timeout) as client:
            if event == "agent:start":
                client.post(
                    f"{mc_url}/api/agents/register",
                    json={
                        "name": "hermes-grader",
                        "role": "agent",
                        "capabilities": ["grading", "vision", "web-search"],
                        "framework": "generic",
                    },
                    headers=headers,
                )
            elif event == "agent:end":
                # Try to update agent status — find agent by name first
                resp = client.get(
                    f"{mc_url}/api/agents",
                    headers=headers,
                )
                if resp.status_code == 200:
                    agents = resp.json()
                    for agent in agents if isinstance(agents, list) else []:
                        if agent.get("name") == "hermes-grader":
                            agent_id = agent.get("id")
                            if agent_id:
                                client.patch(
                                    f"{mc_url}/api/agents/{agent_id}",
                                    json={"status": "idle"},
                                    headers=headers,
                                )
                            break
            elif event == "session:start":
                session_id = data.get("session_id", "")
                model = data.get("model", "")
                if session_id:
                    client.post(
                        f"{mc_url}/api/hermes/events",
                        json={
                            "event": "session:start",
                            "session_id": session_id,
                            "model": model,
                            "source": data.get("source", "api"),
                        },
                        headers=headers,
                    )
    except Exception:
        # MC being unreachable must never break Hermes
        pass


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Commit**

```bash
git add services/hermes/hooks/mission-control/
git commit -m "feat: add Mission Control telemetry hook for Hermes"
```

---

### Task 3: Hermes Dockerfile — copy hooks into image

**Files:**
- Modify: `services/hermes/Dockerfile`

- [ ] **Step 1: Add COPY line for hooks directory**

In `services/hermes/Dockerfile`, after line 24 (`COPY services/hermes/config.yaml /root/.hermes/config.yaml`), add:

```dockerfile
COPY services/hermes/hooks/ /root/.hermes/hooks/
```

- [ ] **Step 2: Commit**

```bash
git add services/hermes/Dockerfile
git commit -m "feat: copy MC hooks into Hermes Docker image"
```

---

### Task 4: Worker token reporting

**Files:**
- Modify: `services/workers/activities/grading.py`

- [ ] **Step 1: Add MC env var reads**

In `services/workers/activities/grading.py`, after line 26 (`DEFAULT_MODEL = ...`), add:

```python
MC_URL = os.environ.get("MC_URL", "")
MC_API_KEY = os.environ.get("MC_API_KEY", "")
```

- [ ] **Step 2: Add the reporting helper function**

After the `_get_provider_settings` function (after line 55), add:

```python
async def _report_to_mission_control(
    trace_data: dict, submission_id: str
) -> None:
    """Fire-and-forget token usage report to Mission Control."""
    if not MC_URL or not MC_API_KEY:
        return
    usage = trace_data.get("usage", {})
    if not usage:
        return
    payload = {
        "model": trace_data.get("model", "unknown"),
        "session_id": f"grading-{submission_id}",
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{MC_URL}/api/tokens",
                json=payload,
                headers={"x-api-key": MC_API_KEY},
            )
    except Exception:
        pass  # MC down must not affect grading
```

- [ ] **Step 3: Call the helper after trace extraction**

In the `evaluate_submission` function, after the trace data is built and before the return statement (around line 478, after `feedback = _parse_agent_response(raw_content)`), add:

```python
        # Report token usage to Mission Control
        if trace_data:
            try:
                await _report_to_mission_control(trace_data, submission_id)
            except Exception:
                pass
```

- [ ] **Step 4: Verify Python syntax**

Run: `python3 -m py_compile services/workers/activities/grading.py`
Expected: No output (valid syntax)

- [ ] **Step 5: Commit**

```bash
git add services/workers/activities/grading.py
git commit -m "feat: report token usage to Mission Control after evaluation"
```

---

### Task 5: Caddy, env vars, nav link

**Files:**
- Modify: `infra/hetzner/Caddyfile`
- Modify: `infra/local/.env.example`
- Modify: `frontend/src/components/nav-bar.tsx`

- [ ] **Step 1: Add MC proxy block to Caddyfile**

In `infra/hetzner/Caddyfile`, after the Temporal UI block (after line 19), add:

```
# Mission Control — HTTPS on port 3001 (proxied to internal 3000)
hermes-agent-solution-template.fierro.co.uk:3001 {
    reverse_proxy localhost:3000
}
```

Note: This uses MC's internal port 3000 (mapped to host port 3001 by docker-compose). Caddy on the host proxies 3001→3000 would be wrong — Caddy listens on 3001 and proxies to the container's mapped port 3001. Actually, since docker-compose maps `127.0.0.1:3001:3000`, Caddy should proxy to `localhost:3001`:

```
# Mission Control — HTTPS on port 3001 (proxied to Docker-mapped 3001)
hermes-agent-solution-template.fierro.co.uk:3001 {
    reverse_proxy localhost:3001
}
```

- [ ] **Step 2: Add MC env vars to .env.example**

In `infra/local/.env.example`, add a new section before the Database section:

```bash

# Mission Control — agent observability dashboard
# MC_AUTH_USER=admin
# MC_AUTH_PASS=pick-a-password
# MC_API_KEY=pick-any-secret-for-agent-reporting
```

- [ ] **Step 3: Add Mission Control nav link**

In `frontend/src/components/nav-bar.tsx`, after the `chatUrl` construction (after line 14), add:

```typescript
  const mcUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : ":3001";
```

Then in the `links` array (around line 16-22), add Mission Control after Chat (line 20) and before Settings (line 21):

```typescript
    { to: mcUrl, label: "Mission Control", external: true },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "submissions.\$id.tsx"`
Expected: No output (clean)

- [ ] **Step 5: Commit**

```bash
git add infra/hetzner/Caddyfile infra/local/.env.example frontend/src/components/nav-bar.tsx
git commit -m "feat: add MC Caddy proxy, env vars, and nav link"
```

---

### Task 6: Version bump to 0.15.0

**Files:**
- Modify: `frontend/package.json` (line 3)
- Modify: `services/api/main.py` (line 32)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump frontend version**

In `frontend/package.json`, change line 3:

```json
  "version": "0.15.0",
```

- [ ] **Step 2: Bump API version**

In `services/api/main.py`, change line 32:

```python
    version="0.15.0",
```

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`, find `Current version: **v0.1.0**` and change to:

```markdown
Current version: **v0.15.0**
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json services/api/main.py CLAUDE.md
git commit -m "chore: bump version to v0.15.0"
```

---

### Task 7: Update .env with MC credentials

**Files:**
- Modify: `infra/shared/.env` (gitignored, not committed)

- [ ] **Step 1: Add MC credentials to .env**

Add to `infra/shared/.env`:

```bash
# Mission Control
MC_AUTH_USER=admin
MC_AUTH_PASS=hast-mc-admin-2026
MC_API_KEY=mc-hermes-telemetry-key-2026
```

This file is gitignored — it needs to be synced to Hetzner via `scp` during deployment.

---

## Execution Notes

- Tasks 1-4 can be parallelized (docker-compose, hooks, Dockerfile, worker are independent files)
- Task 5 depends on nothing and can run in parallel too
- Task 6 (version bump) should be last
- Task 7 is a manual .env update, not committed
- After all tasks: create PR, review, test locally, deploy to Hetzner
