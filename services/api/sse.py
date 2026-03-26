"""SSE (Server-Sent Events) formatting utilities.

Provides a single helper for consistent SSE event formatting across
streaming endpoints (e.g. grading progress updates).
"""

from __future__ import annotations

import json
from typing import Any


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE event string.

    Returns a string like::

        event: progress
        data: {"step": "evaluating", "pct": 50}

    with the required trailing double-newline.
    """
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
