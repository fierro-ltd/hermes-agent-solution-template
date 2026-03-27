"""Shared lifespan dependencies: asyncpg pool and Temporal client."""

from __future__ import annotations

import os

import asyncpg
from temporalio.client import Client

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_pool: asyncpg.Pool | None = None
_temporal_client: Client | None = None


# ---------------------------------------------------------------------------
# Getters
# ---------------------------------------------------------------------------


async def get_pool() -> asyncpg.Pool:
    """Return the asyncpg connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ.get(
                "DATABASE_URL",
                "postgresql://postgres:postgres@localhost:5432/edu_agent",
            ),
            min_size=2,
            max_size=10,
        )
    return _pool


async def get_temporal_client() -> Client:
    """Return the Temporal client, connecting on first call."""
    global _temporal_client
    if _temporal_client is None:
        _temporal_client = await Client.connect(
            os.environ.get("TEMPORAL_ADDRESS", "localhost:7233"),
        )
    return _temporal_client


# ---------------------------------------------------------------------------
# Lifespan helpers
# ---------------------------------------------------------------------------


async def startup() -> None:
    """Initialize connections on app startup."""
    await get_pool()
    await get_temporal_client()


async def shutdown() -> None:
    """Clean up connections on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
