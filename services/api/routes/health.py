"""Health check endpoint — no authentication required."""

from __future__ import annotations

from fastapi import APIRouter

from services.api import deps

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """Return service health with dependency status checks."""
    services: dict[str, str] = {}

    # Postgres
    try:
        pool = await deps.get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        services["postgres"] = "ok"
    except Exception as exc:
        services["postgres"] = f"error: {exc}"

    # Temporal
    try:
        client = await deps.get_temporal_client()
        # A lightweight RPC to confirm connectivity
        await client.service_client.check_health()
        services["temporal"] = "ok"
    except Exception as exc:
        services["temporal"] = f"error: {exc}"

    # Hermes (LLM inference service) — simple TCP check
    import os, httpx

    hermes_url = os.environ.get("HERMES_URL", "http://hermes:8080")
    try:
        async with httpx.AsyncClient(timeout=3.0) as http:
            resp = await http.get(f"{hermes_url}/health")
            services["hermes"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception as exc:
        services["hermes"] = f"error: {exc}"

    import os

    auth_bypass = os.environ.get("AUTH_BYPASS", "").lower() == "true"
    overall = "ok" if all(v == "ok" for v in services.values()) else "degraded"
    return {"status": overall, "services": services, "auth_bypass": auth_bypass}
