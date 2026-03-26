"""FastAPI application entrypoint for edu-agent-platform."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from services.api import deps
from services.api.auth import verify_auth
from services.api.routes import health, reviews, settings, stats, submissions

_STATIC_DIR = Path("/app/static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB pool and Temporal client on startup; clean up on shutdown."""
    await deps.startup()
    yield
    await deps.shutdown()


app = FastAPI(
    title="Edu Agent Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_cors_origins: list[str] = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:8000",  # Local Docker
]

# Allow additional origins from env (comma-separated)
_extra_origins = os.environ.get("CORS_ORIGINS", "")
if _extra_origins:
    _cors_origins.extend(o.strip() for o in _extra_origins.split(",") if o.strip())

_site_domain = os.environ.get("SITE_DOMAIN")
if _site_domain:
    _cors_origins.append(f"https://{_site_domain}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# Health endpoint — no auth required
app.include_router(health.router)

# All /api routes require authentication
_auth_deps = [Depends(verify_auth)]
app.include_router(submissions.router, prefix="/api", dependencies=_auth_deps)
app.include_router(reviews.router, prefix="/api", dependencies=_auth_deps)
app.include_router(settings.router, prefix="/api", dependencies=_auth_deps)
app.include_router(stats.router, prefix="/api", dependencies=_auth_deps)

# ---------------------------------------------------------------------------
# SPA fallback — serve frontend from /app/static (production)
# ---------------------------------------------------------------------------

if _STATIC_DIR.is_dir():
    _ASSETS_DIR = _STATIC_DIR / "assets"
    if _ASSETS_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="static-assets")

    _INDEX_HTML = _STATIC_DIR / "index.html"

    @app.get("/{path:path}")
    async def spa_fallback(request: Request, path: str) -> FileResponse:
        """Serve the SPA for any non-API route."""
        # Serve actual files from static dir if they exist (favicon, etc.)
        try:
            static_file = (_STATIC_DIR / path).resolve()
            if static_file.is_relative_to(_STATIC_DIR) and static_file.is_file():
                return FileResponse(str(static_file))
        except (ValueError, OSError):
            pass  # Fall through to index.html for SPA routing
        return FileResponse(str(_INDEX_HTML))
