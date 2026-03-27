"""better-auth session verification for FastAPI.

In dev mode (AUTH_SECRET not set), authentication is bypassed and a dev user
is returned.  In production the session token is read from the
``better-auth.session_token`` cookie or ``Authorization: Bearer <token>``
header and verified by querying the ``session`` table directly.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, Request, status

from services.api import deps


_dev_mode = not os.environ.get("AUTH_SECRET")
_auth_bypass = os.environ.get("AUTH_BYPASS", "").lower() in ("true", "1", "yes")


async def verify_auth(request: Request) -> dict[str, Any]:
    """FastAPI dependency that verifies a better-auth session.

    Returns a dict with at least ``sub``, ``email``, and optionally ``name``.
    """

    # Dev mode: bypass auth when AUTH_SECRET is not set
    # Auth bypass: explicit override for debugging deployed environments
    if _dev_mode or _auth_bypass:
        return {"sub": "dev-user", "email": "dev@localhost"}

    # Extract token from cookie or Authorization header
    token: str | None = request.cookies.get("better-auth.session_token")

    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    # Query the session table directly (created by better-auth)
    pool = await deps.get_pool()
    row = await pool.fetchrow(
        'SELECT s.*, u.email, u.name '
        'FROM session s '
        'JOIN "user" u ON s."userId" = u.id '
        'WHERE s.token = $1 AND s."expiresAt" > NOW()',
        token,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return {
        "sub": str(row["userId"]),
        "email": row["email"],
        "name": row.get("name"),
    }
