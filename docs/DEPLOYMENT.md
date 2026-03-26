# Deployment Guide

> How to run the Hermes Agent Solution Template (HAST) locally and in production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Docker Compose Configuration](#docker-compose-configuration)
- [Environment Variables Reference](#environment-variables-reference)
- [Production Deployment (Hetzner/VPS with Caddy)](#production-deployment-hetznervps-with-caddy)
- [AWS Lightsail Deployment](#aws-lightsail-deployment)
- [Deployment Diagram](#deployment-diagram)
- [SSL/TLS Setup with Caddy](#ssltls-setup-with-caddy)
- [Database Management](#database-management)
- [Monitoring and Logs](#monitoring-and-logs)
- [Troubleshooting](#troubleshooting)
- [See Also](#see-also)

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Multi-container orchestration |
| Node.js | 18+ | Auth service, frontend dev |
| pnpm | 8+ | Frontend package manager |
| Python | 3.11+ | API and worker development |
| Git | 2.x | Version control |

---

## Local Development Setup

### Step 1: Clone the repository

```bash
git clone <repository-url> hermes-agent-solution-template
cd hermes-agent-solution-template
```

### Step 2: Create the environment file

```bash
cp infra/local/.env.example infra/shared/.env
```

### Step 3: Configure environment variables

Edit `infra/shared/.env` and set at minimum:

```bash
# Required: Your LLM provider API key
LLM_API_KEY=your-actual-api-key

# Required: Self-assigned key for Hermes gateway auth
HERMES_API_KEY=any-secret-string-you-choose

# Optional: Set for production-like auth (leave default for dev)
AUTH_SECRET=dev-secret-change-in-production
```

### Step 4: Start all services

```bash
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               up --build
```

This starts all 7 containers. First boot takes a few minutes as images are pulled and built.

### Step 5: Access the application

| Service | URL | Purpose |
|---|---|---|
| Web UI | http://localhost:8000 | Main application |
| Auth Service | (internal, proxied via :8000/api/auth) | Authentication API |
| Temporal UI | http://localhost:8233 | Workflow inspector |
| PostgreSQL | localhost:5432 | Database (user: `temporal`, password: `temporal`) |
| Hermes Gateway | http://localhost:8088 | AI agent API |

### Step 6: Sign up

1. Open http://localhost:8000/login
2. Click "Sign up"
3. Use the test credentials or your own:
   - Email: `prof@test.edu`
   - Password: `TestPassword123!`
   - Name: `Professor Test`

### Step 7: Frontend hot-reload development (optional)

For frontend development with hot module replacement:

```bash
cd frontend
pnpm install
pnpm dev
```

The Vite dev server runs at `http://localhost:5173` and proxies API calls to `:8000`.

### Stopping services

```bash
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               down
```

To also remove volumes (resets database):

```bash
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               down -v
```

---

## Docker Compose Configuration

The template uses a **base + override** pattern for Docker Compose:

```mermaid
graph TD
    Base["infra/shared/docker-compose.yml<br/>(Base configuration)"] --> Final["Merged Configuration"]
    Override["infra/local/docker-compose.override.yml<br/>(Dev overrides)"] --> Final
    Env["infra/shared/.env<br/>(Environment variables)"] --> Final

    style Base fill:#e1f5fe
    style Override fill:#fff3e0
    style Env fill:#e8f5e9
```

### Base file (`infra/shared/docker-compose.yml`)

Defines all 7 services, ports, health checks, dependencies, and volumes. This is used in both development and production.

Key features:
- All ports bound to `127.0.0.1` (localhost only)
- Health checks with readiness conditions on all services
- Service dependency ordering: postgres -> temporal -> everything else
- Two named volumes: `postgres_data` (persistent DB), `upload_data` (file uploads)

### Override file (`infra/local/docker-compose.override.yml`)

Adds development-specific configuration:

```yaml
services:
  api:
    volumes:
      - ../../src:/app/src:ro          # Mount shared Python package
      - ../../services/api:/app/services/api:ro  # Mount API source
    environment:
      - UVICORN_RELOAD=true            # Auto-reload on code changes

  worker:
    volumes:
      - ../../src:/app/src:ro
      - ../../services/workers:/app/services/workers:ro
    environment:
      - WORKER_RELOAD=true

  hermes-gateway:
    volumes:
      - ../../services/hermes/SOUL.md:/root/.hermes/SOUL.md:ro
      - ../../services/hermes/config.yaml:/root/.hermes/config.yaml:ro
```

This enables:
- **Hot reload** for the API (Uvicorn) and worker on Python file changes
- **Source mounting** so you edit files on your host and see changes without rebuilding
- **Hermes config mounting** so SOUL.md and config.yaml changes take effect on restart

---

## Environment Variables Reference

All variables are set in `infra/shared/.env`. The `.env` file is loaded by Docker Compose and passed to containers via `env_file` directives.

### Required Variables

| Variable | Service(s) | Description | Example |
|---|---|---|---|
| `LLM_API_KEY` | hermes-gateway | API key for the LLM provider (OpenRouter, Anthropic, etc.) | `sk-or-v1-abc123...` |
| `HERMES_API_KEY` | hermes-gateway, worker | Self-assigned key protecting the Hermes `/v1/chat/completions` endpoint | `my-hermes-secret` |

### Authentication Variables

| Variable | Service(s) | Default | Description |
|---|---|---|---|
| `AUTH_SECRET` | auth | `dev-secret-change-in-production` | Random string for signing sessions. **Must be set in production.** When unset/default, FastAPI backend bypasses auth. |
| `AUTH_SERVICE_URL` | api (runtime) | `http://auth:3100` | Internal URL of the better-auth service (used by the API proxy) |
| `GOOGLE_CLIENT_ID` | auth | (empty) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | auth | (empty) | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | auth | (empty) | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | auth | (empty) | GitHub OAuth app client secret |

### Infrastructure Variables

| Variable | Service(s) | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | api, worker, auth | `postgresql://app_user:app_password@postgres:5432/app_db` | PostgreSQL connection string (set via docker-compose.yml `environment`) |
| `TEMPORAL_ADDRESS` | api, worker | `temporal:7233` | Temporal server gRPC address (set via docker-compose.yml) |
| `HERMES_API_URL` | api, worker | `http://hermes-gateway:8088` | Hermes gateway URL (set via docker-compose.yml) |
| `HERMES_MODEL_PROVIDER` | hermes-gateway | `anthropic` | LLM provider for Hermes (`anthropic`, `openrouter`, `opencode-go`) |

### Application Variables

| Variable | Service(s) | Default | Description |
|---|---|---|---|
| `TASK_QUEUE` | worker | `grading` | Temporal task queue name |
| `GRADING_TIMEOUT_DAYS` | worker | `7` | Days before unreviewed submissions expire |
| `UPLOAD_DIR` | api | `/app/uploads` | Directory for uploaded files |
| `CORS_ORIGINS` | api, auth | (empty) | Additional CORS origins (comma-separated) |
| `SITE_DOMAIN` | api | (empty) | Production domain (adds `https://{domain}` to CORS) |

---

## Production Deployment (Hetzner/VPS with Caddy)

### Step 1: Provision a VPS

- Recommended: Hetzner CX21 (2 vCPU, 4 GB RAM) or equivalent
- OS: Ubuntu 22.04 LTS
- Install Docker and Docker Compose

### Step 2: Clone and configure

```bash
git clone <repository-url> /opt/hast
cd /opt/hast
cp infra/local/.env.example infra/shared/.env
```

Edit `infra/shared/.env` with production values:

```bash
# Generate a strong random secret
AUTH_SECRET=$(openssl rand -hex 32)
HERMES_API_KEY=$(openssl rand -hex 16)
LLM_API_KEY=your-production-llm-api-key
HERMES_MODEL_PROVIDER=openrouter
SITE_DOMAIN=grades.yourdomain.com
CORS_ORIGINS=https://grades.yourdomain.com
```

### Step 3: Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Step 4: Configure Caddy

Create `/etc/caddy/Caddyfile`:

```
grades.yourdomain.com {
    # Main application (API + SPA + auth proxy)
    reverse_proxy localhost:8000
}
```

### Step 5: Start services

```bash
cd /opt/hast
docker compose -f infra/shared/docker-compose.yml up -d --build
sudo systemctl restart caddy
```

### Step 6: Configure DNS

Point your domain (`grades.yourdomain.com`) to the VPS IP address. Caddy will automatically obtain and renew Let's Encrypt certificates.

---

## AWS Lightsail Deployment

### Step 1: Create a Lightsail instance

- Plan: 2 GB RAM / 1 vCPU minimum (4 GB recommended)
- Blueprint: Ubuntu 22.04
- Networking: Open ports 80, 443

### Step 2: Install Docker

```bash
# SSH into the instance
ssh -i lightsail-key.pem ubuntu@<public-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Install Docker Compose plugin
sudo apt-get install docker-compose-plugin
```

### Step 3: Deploy

Follow the same steps as the Hetzner/VPS deployment (Steps 2-6 above).

### Step 4: Configure Lightsail networking

In the Lightsail console:
1. Go to Networking tab
2. Add rules for ports 80 (HTTP) and 443 (HTTPS)
3. Optionally attach a static IP
4. Set up DNS using Lightsail DNS zones or your DNS provider

---

## Deployment Diagram

```mermaid
graph TB
    subgraph "Internet"
        Users["Users / Browsers"]
    end

    subgraph "VPS (Hetzner / Lightsail)"
        Caddy["Caddy Reverse Proxy<br/>:80 / :443<br/>Auto SSL"]

        subgraph "Docker Network (127.0.0.1 only)"
            API["api :8000"]
            Auth["auth :3100"]
            Worker["worker"]
            Temporal["temporal :7233"]
            TemporalUI["temporal-ui :8233"]
            Hermes["hermes-gateway :8088"]
            Postgres["postgres :5432"]
        end

        Caddy -->|"/* → :8000"| API
        API -->|"/api/auth/* proxy"| Auth
    end

    subgraph "External"
        LLM["LLM Provider API<br/>(OpenRouter, Anthropic)"]
        DNS["DNS Provider"]
    end

    Users -->|"HTTPS :443"| Caddy
    Hermes -->|"HTTPS"| LLM
    DNS -->|"A record"| Caddy

    style Caddy fill:#e8f5e9
    style API fill:#fff3e0
    style Postgres fill:#fce4ec
```

---

## SSL/TLS Setup with Caddy

Caddy handles SSL/TLS automatically:

1. **Automatic HTTPS:** When you specify a domain in the Caddyfile, Caddy automatically obtains a Let's Encrypt certificate.
2. **Auto-renewal:** Certificates are renewed before expiration without any manual intervention.
3. **HTTP-to-HTTPS redirect:** Caddy automatically redirects HTTP to HTTPS.
4. **Modern TLS:** Caddy uses secure defaults (TLS 1.2+, strong ciphers).

**Requirements:**
- Port 80 must be open (for ACME HTTP challenge)
- Port 443 must be open (for HTTPS)
- DNS must point to the server before starting Caddy

**Testing locally with self-signed certs:**

```
localhost {
    tls internal
    reverse_proxy localhost:8000
}
```

---

## Database Management

### Initialization

The database is automatically initialized by `infra/shared/init-db.sql` when the Postgres container starts for the first time. This script:

1. Creates the `app_user` role with password `app_password`
2. Creates the `app_db` database owned by `app_user`
3. Creates the `submissions`, `reviews`, and `app_settings` tables with indexes
4. Inserts default settings (rubric, grading instructions, max score, hermes model)
5. Creates better-auth tables (`user`, `session`, `account`, `verification`)
6. Grants all privileges to `app_user`

The `temporal` database is created automatically by the `temporalio/auto-setup` image.

### Connecting to the database

```bash
# From the host (when Postgres port is mapped)
psql -h localhost -U app_user -d app_db
# Password: app_password

# From inside the Docker network
docker compose -f infra/shared/docker-compose.yml exec postgres \
  psql -U app_user -d app_db
```

### Reset the database

Remove the Postgres volume to start fresh:

```bash
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               down -v

# Restart to re-run init-db.sql
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               up --build
```

### Backup

```bash
# Backup app_db
docker compose -f infra/shared/docker-compose.yml exec postgres \
  pg_dump -U app_user app_db > backup_$(date +%Y%m%d).sql

# Restore
docker compose -f infra/shared/docker-compose.yml exec -T postgres \
  psql -U app_user app_db < backup_20260326.sql
```

### Adding columns or tables (migrations)

The template does not use a migration tool. To add columns:

1. Write a SQL migration script (e.g., `ALTER TABLE submissions ADD COLUMN ...`)
2. Apply it manually via `psql` or `docker exec`
3. Update `init-db.sql` to include the change for new installations
4. Update relevant Pydantic models in `services/api/schemas.py`
5. Update relevant dataclasses in `services/workers/schemas.py`

---

## Monitoring and Logs

### Viewing logs

```bash
# All services
docker compose -f infra/shared/docker-compose.yml logs -f

# Specific service
docker compose -f infra/shared/docker-compose.yml logs -f api
docker compose -f infra/shared/docker-compose.yml logs -f worker
docker compose -f infra/shared/docker-compose.yml logs -f hermes-gateway
docker compose -f infra/shared/docker-compose.yml logs -f auth
docker compose -f infra/shared/docker-compose.yml logs -f temporal
```

### Service-specific log locations

| Service | What to look for |
|---|---|
| **api** | Request logs (method, path, status), auth failures, Temporal client errors |
| **worker** | Activity execution logs ("Evaluating submission X"), Hermes call results, retry attempts |
| **hermes-gateway** | Model provider selection, API call errors, health check status |
| **auth** | Sign-in/sign-up attempts, OAuth callback errors, session creation |
| **temporal** | Workflow scheduling, task queue stats, workflow timeouts |
| **postgres** | Connection errors, slow queries, disk usage warnings |

### Temporal UI

Access `http://localhost:8233` to:
- View running and completed workflows
- Inspect workflow execution history (each step)
- See pending activities and signals
- Debug failed workflows with full event logs

---

## Troubleshooting

### Container fails to start

**Problem:** A container exits immediately or enters a restart loop.

```bash
# Check logs for the specific service
docker compose -f infra/shared/docker-compose.yml logs <service-name>

# Check container status
docker compose -f infra/shared/docker-compose.yml ps
```

### "Connection refused" to Temporal

**Problem:** API or worker cannot connect to Temporal.

**Cause:** Temporal takes 20-30 seconds to initialize on first boot. It must create its database schema.

**Solution:** Wait for the Temporal health check to pass. Check with:
```bash
docker compose -f infra/shared/docker-compose.yml logs temporal
```

### Authentication errors (401) in development

**Problem:** API returns 401 even though you're signed in.

**Cause:** If `AUTH_SECRET` is set in `.env`, auth is enforced. Make sure it matches what the auth service uses.

**Solution:** For local dev, comment out or remove `AUTH_SECRET` from `.env` to enable dev mode bypass.

### Hermes returns empty or error responses

**Problem:** Grading workflow fails at the evaluate_submission activity.

**Possible causes:**
1. `LLM_API_KEY` is not set or invalid
2. `HERMES_API_KEY` mismatch between worker and hermes-gateway
3. The configured model is not available at the LLM provider

**Debug:**
```bash
# Test Hermes directly
curl http://localhost:8088/health

# Check worker logs for the specific error
docker compose -f infra/shared/docker-compose.yml logs worker
```

### Database "relation does not exist"

**Problem:** Queries fail because tables don't exist.

**Cause:** `init-db.sql` only runs on first container start when the volume is empty.

**Solution:** Reset the database by removing the volume (see [Reset the database](#reset-the-database)).

### Frontend shows blank page

**Problem:** `http://localhost:8000` shows a white page.

**Possible causes:**
1. Frontend was not built (production mode requires `pnpm build` output in `/app/static`)
2. For development, use `http://localhost:5173` instead (Vite dev server)

**Solution:** Ensure the API container Dockerfile includes the frontend build step, or use the Vite dev server for development.

---

## See Also

- [Architecture](./ARCHITECTURE.md) -- System design and container responsibilities
- [API Reference](./API.md) -- Endpoint documentation
- [Data Model](./DATA_MODEL.md) -- Database schema details
- [Customization](./CUSTOMIZATION.md) -- Forking and adapting the template
