"""Grading activities — AI evaluation, notification, and grade recording."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import time as _time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from temporalio import activity
from temporalio.exceptions import ApplicationError

from services.workers.schemas import AgentFeedback

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL", "")
HERMES_API_URL = os.environ.get("HERMES_API_URL", "http://hermes:8000")
HERMES_API_KEY = os.environ.get("HERMES_API_KEY", "")
DEFAULT_MODEL = os.environ.get("HERMES_DEFAULT_MODEL", "hermes-agent")


async def _get_db_pool():
    """Return a shared asyncpg connection pool (lazy-initialised)."""
    import asyncpg

    if not hasattr(_get_db_pool, "_pool") or _get_db_pool._pool is None:
        _get_db_pool._pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    return _get_db_pool._pool


async def _get_provider_settings(pool) -> dict[str, str]:
    """Read LLM provider settings from app_settings.

    Returns a dict with keys: provider, model, api_key.
    Falls back to environment variable defaults when DB values are empty.
    """
    rows = await pool.fetch(
        "SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3)",
        "hermes_provider",
        "hermes_model",
        "hermes_api_key",
    )
    settings = {r["key"]: r["value"] for r in rows}
    return {
        "provider": settings.get("hermes_provider", ""),
        "model": settings.get("hermes_model", "") or DEFAULT_MODEL,
        "api_key": settings.get("hermes_api_key", "") or HERMES_API_KEY,
    }


def _build_system_prompt(rubric: str, professor_feedback: str | None) -> str:
    """Build the system prompt for the grading agent."""
    prompt = (
        "You are an expert academic grading assistant. "
        "Evaluate the following student submission against the provided rubric. "
        "Return your evaluation as a JSON object with these fields:\n"
        '  - "suggested_score": a numeric score\n'
        '  - "strengths": a list of strength descriptions\n'
        '  - "weaknesses": a list of weakness descriptions\n'
        '  - "reasoning": a string explaining your overall assessment\n\n'
        f"## Rubric\n{rubric}\n"
    )
    if professor_feedback:
        prompt += (
            "\n## Professor Feedback from Previous Review\n"
            "The professor has asked you to re-evaluate. Take the following "
            "feedback into account:\n"
            f"{professor_feedback}\n"
        )
    return prompt


def _parse_agent_response(raw: str) -> AgentFeedback:
    """Parse the LLM's JSON response into an AgentFeedback dataclass.

    Handles common LLM quirks: markdown code fences, JSON embedded in prose,
    empty responses, and non-JSON output.
    """
    import re

    text = raw.strip()
    if not text:
        raise ValueError("Empty response from agent")

    # Try 1: Strip markdown code fences (```json ... ```)
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    # Try 2: Direct JSON parse
    try:
        data = json.loads(text)
        return AgentFeedback(
            suggested_score=float(data["suggested_score"]),
            strengths=list(data.get("strengths", [])),
            weaknesses=list(data.get("weaknesses", [])),
            reasoning=str(data.get("reasoning", "")),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        pass

    # Try 3: Extract JSON object from within prose text
    json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group())
            return AgentFeedback(
                suggested_score=float(data.get("suggested_score", 50)),
                strengths=list(data.get("strengths", [])),
                weaknesses=list(data.get("weaknesses", [])),
                reasoning=str(data.get("reasoning", "")),
            )
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    # Fallback: create a basic feedback from the raw text
    activity.logger.warning("Could not parse JSON from agent response, using fallback")
    return AgentFeedback(
        suggested_score=50.0,
        strengths=["Agent provided a text response (see reasoning)"],
        weaknesses=["Response was not in the expected JSON format"],
        reasoning=text[:2000],
    )


async def _heartbeat_loop() -> None:
    """Send periodic heartbeats while awaiting a long-running LLM call."""
    while True:
        activity.heartbeat("awaiting LLM response")
        await asyncio.sleep(10)


def _extract_content_text(content) -> str:
    """Extract plain text from Hermes response content.

    Content can be a string or a list of content parts like:
    [{"type": "output_text", "text": "..."}]
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(part.get("text", part.get("content", "")))
            elif isinstance(part, str):
                parts.append(part)
        return "\n".join(parts)
    return str(content) if content else ""


def _split_message_into_steps(content: str, base_ts: float, total_elapsed: float) -> list[dict]:
    """Split a single agent message into multiple reasoning steps.

    When the agent puts its entire thinking + JSON in one message, we parse
    sections delimited by markdown headers (# or **Header:**) to create a
    richer trace timeline. Content is stored as plain text (no markdown).
    """
    import re

    # Separate reasoning from JSON output
    json_match = re.search(r'```json\s*\n?\{', content)
    if not json_match:
        json_match = re.search(r'\n\s*\{[^{]*"suggested_score"', content)

    reasoning_text = content[:json_match.start()].strip() if json_match else ""
    json_text = content[json_match.start():].strip() if json_match else content

    steps: list[dict] = []

    if reasoning_text:
        # Try splitting by markdown heading headers (### or ##)
        sections = re.split(r'\n\s*#{1,3}\s+(.+)', reasoning_text)

        # If no heading splits found, try bold headers (**Header:**)
        if len(sections) <= 1:
            sections = re.split(r'\n\s*\*\*([^*]+)\*\*', reasoning_text)

        # If still no splits, try double-newline paragraph breaks
        if len(sections) <= 1:
            paragraphs = [p.strip() for p in re.split(r'\n\s*\n', reasoning_text) if p.strip()]
            if len(paragraphs) > 1:
                for idx, para in enumerate(paragraphs):
                    frac = idx / max(len(paragraphs), 1)
                    ts = round(base_ts + frac * total_elapsed * 0.8, 1)
                    # Strip markdown formatting for plain text display
                    plain = re.sub(r'[#*_`]', '', para).strip()
                    steps.append({
                        "type": "reasoning",
                        "content": plain[:1000],
                        "timestamp": ts,
                    })
            else:
                # Single block of text — just use it as one reasoning step
                plain = re.sub(r'[#*_`]', '', reasoning_text).strip()
                steps.append({
                    "type": "reasoning",
                    "content": plain[:1000],
                    "timestamp": base_ts,
                })
        else:
            # Process header/body pairs
            if sections[0].strip():
                plain = re.sub(r'[#*_`]', '', sections[0]).strip()
                steps.append({
                    "type": "reasoning",
                    "content": plain[:1000],
                    "timestamp": base_ts,
                })

            for i in range(1, len(sections) - 1, 2):
                header = re.sub(r'[#*_`]', '', sections[i]).strip().rstrip(":")
                body = sections[i + 1].strip() if i + 1 < len(sections) else ""
                body_plain = re.sub(r'[#*_`]', '', body).strip()
                frac = (len(steps) + 1) / max(len(sections) // 2 + 1, 2)
                ts = round(base_ts + frac * total_elapsed * 0.8, 1)
                summary = f"{header}: {body_plain[:800]}" if body_plain else header
                steps.append({
                    "type": "reasoning",
                    "content": summary,
                    "timestamp": ts,
                })

    # Final message step
    steps.append({
        "type": "message",
        "content": "",  # Don't store the full JSON in the step
        "timestamp": round(total_elapsed, 1),
    })

    return steps


def _extract_trace(output_items: list[dict], usage: dict, session_id: str,
                   start_time: float, model: str) -> dict:
    """Transform Hermes /v1/responses output items into a normalized trace."""
    steps: list[dict] = []
    call_id_to_name: dict[str, str] = {}
    tools_used: set[str] = set()
    total_elapsed = _time.time() - start_time
    item_count = max(len(output_items), 1)

    for idx, item in enumerate(output_items):
        item_type = item.get("type", "")
        ts = round((idx / item_count) * total_elapsed, 1)

        if item_type == "function_call":
            name = item.get("name", "")
            call_id = item.get("call_id", "")
            call_id_to_name[call_id] = name
            tools_used.add(name)
            try:
                args = json.loads(item.get("arguments", "{}"))
            except (json.JSONDecodeError, TypeError):
                args = {"raw": item.get("arguments", "")}
            steps.append({"type": "tool_call", "name": name, "call_id": call_id, "args": args, "timestamp": ts})
        elif item_type == "function_call_output":
            call_id = item.get("call_id", "")
            name = call_id_to_name.get(call_id, "unknown")
            output_text = item.get("output", "")
            if len(output_text) > 2000:
                output_text = output_text[:2000] + "... (truncated)"
            prev_ts = steps[-1]["timestamp"] if steps else 0
            duration_ms = int((ts - prev_ts) * 1000)
            steps.append({"type": "tool_result", "name": name, "call_id": call_id, "output": output_text, "duration_ms": max(duration_ms, 0), "timestamp": ts})
        elif item_type == "message":
            content = _extract_content_text(item.get("content", ""))
            # If this is the only/last message and contains reasoning + JSON,
            # split it into multiple steps for a richer timeline
            is_last = (idx == len(output_items) - 1)
            has_json = "suggested_score" in content or "```json" in content
            has_structure = "**" in content or "\n#" in content or "\n\n" in content
            if is_last and has_json and has_structure and len(content) > 200:
                steps.extend(_split_message_into_steps(content, ts, total_elapsed))
            else:
                steps.append({"type": "reasoning" if len(steps) > 0 else "message", "content": content[:2000] if len(content) > 2000 else content, "timestamp": ts})

    # If no splitting happened, mark the last message/reasoning as "message"
    if steps and steps[-1]["type"] != "message":
        for i in range(len(steps) - 1, -1, -1):
            if steps[i]["type"] in ("reasoning", "message"):
                steps[i]["type"] = "message"
                break

    return {"steps": steps, "usage": usage, "session_id": session_id, "duration_seconds": round(total_elapsed, 1), "tools_used": sorted(tools_used), "model": model}


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@activity.defn
async def evaluate_submission(
    submission_id: str,
    professor_feedback: str | None = None,
) -> dict:
    """Call the Hermes AI agent to evaluate a student submission.

    Reads submission content and rubric from the database, sends them to the
    Hermes chat completions endpoint, and returns structured feedback.
    Temporal handles retries — httpx client does not retry on its own.
    """
    activity.logger.info("Evaluating submission %s", submission_id)

    pool = await _get_db_pool()

    # Fetch submission content from DB (Fix #4: pass only submission_id)
    row = await pool.fetchrow(
        "SELECT content, content_type, file_path FROM submissions WHERE id = $1",
        submission_id,
    )
    if not row:
        raise ApplicationError(
            f"Submission {submission_id} not found",
            non_retryable=True,
        )
    content = row["content"]
    content_type = row.get("content_type", "text")
    file_path = row.get("file_path")

    # Fetch rubric from app_settings
    rubric = await pool.fetchval(
        "SELECT value FROM app_settings WHERE key = 'rubric'"
    ) or ""

    # Read provider/model settings from the database
    provider_settings = await _get_provider_settings(pool)
    model = provider_settings["model"]
    api_key = provider_settings["api_key"]

    activity.logger.info(
        "Using model=%s provider=%s for submission %s (content_type=%s)",
        model,
        provider_settings["provider"] or "(default)",
        submission_id,
        content_type,
    )

    system_prompt = _build_system_prompt(rubric, professor_feedback)

    # Build user message — multipart for images, plain text otherwise
    if content_type == "image" and file_path:
        import base64
        upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads")
        full_path = os.path.realpath(os.path.join(upload_dir, file_path))
        if not full_path.startswith(os.path.realpath(upload_dir)):
            raise ApplicationError("Invalid file path", non_retryable=True)
        with open(full_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(file_path)[1].lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        mime = mime_map.get(ext, "image/jpeg")
        user_content: str | list = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_data}"}},
        ]
        if content:
            user_content.append({"type": "text", "text": content})
    else:
        user_content = content

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
    }

    start_time = _time.time()
    trace_data: dict | None = None
    raw_content: str = ""

    try:
        heartbeat_task = asyncio.create_task(_heartbeat_loop())
        try:
            # /v1/responses runs the full agent loop synchronously (tools, multi-turn)
            # so it needs a longer timeout than /v1/chat/completions
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{HERMES_API_URL}/v1/responses",
                    json={
                        "input": payload["messages"],
                        "model": payload.get("model", "hermes-agent"),
                        "temperature": payload.get("temperature", 0.3),
                    },
                    headers=headers,
                )
        finally:
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat_task

        if response.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"Hermes /v1/responses returned {response.status_code}",
                request=response.request, response=response,
            )

        resp_json = response.json()
        output_items = resp_json.get("output", [])
        usage = resp_json.get("usage", {})
        session_id = resp_json.get("id", "")
        trace_data = _extract_trace(output_items, usage, session_id, start_time, model)

        for item in reversed(output_items):
            if item.get("type") == "message":
                raw_content = _extract_content_text(item.get("content", ""))
                break
        if not raw_content:
            raw_content = resp_json.get("output_text", "")

    except ApplicationError:
        raise
    except Exception as e:
        activity.logger.warning(
            "Failed to use /v1/responses for %s, falling back to chat/completions: %s",
            submission_id, e,
        )
        heartbeat_task = asyncio.create_task(_heartbeat_loop())
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{HERMES_API_URL}/v1/chat/completions",
                    json=payload, headers=headers,
                )
        finally:
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat_task

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if 400 <= status_code < 500 and status_code != 429:
                raise ApplicationError(f"LLM request failed: HTTP {status_code}", non_retryable=True) from exc
            if status_code == 429:
                retry_after = exc.response.headers.get("retry-after")
                delay = None
                if retry_after:
                    try:
                        delay = timedelta(seconds=min(int(retry_after), 60))
                    except ValueError:
                        pass
                raise ApplicationError("Rate limited (429)", non_retryable=False, next_retry_delay=delay) from exc
            raise

        resp_json = response.json()
        raw_content = resp_json["choices"][0]["message"]["content"]
        # Build a basic trace from the chat/completions response
        usage = resp_json.get("usage", {})
        elapsed = round(_time.time() - start_time, 1)
        trace_data = {
            "steps": [{"type": "message", "content": raw_content[:2000], "timestamp": elapsed}],
            "usage": usage,
            "session_id": resp_json.get("id", ""),
            "duration_seconds": elapsed,
            "tools_used": [],
            "model": model,
        }

    if not raw_content:
        raise ApplicationError("Empty response from Hermes", non_retryable=True)

    feedback = _parse_agent_response(raw_content)
    activity.logger.info("Submission %s evaluated: score=%.1f", submission_id, feedback.suggested_score)

    feedback_dict = {
        "suggested_score": feedback.suggested_score,
        "strengths": feedback.strengths,
        "weaknesses": feedback.weaknesses,
        "reasoning": feedback.reasoning,
    }
    return {"feedback": feedback_dict, "trace": trace_data}


@activity.defn
async def persist_review(
    submission_id: str,
    feedback_json: str,
    suggested_score: float,
    review_cycle: int = 1,
    agent_trace_json: str | None = None,
) -> str:
    """Persist a review record in Postgres and return the review ID.

    Uses a deterministic review ID derived from the workflow run ID and review
    cycle to ensure idempotent writes on activity retries (Fix #3).
    """
    activity.logger.info("Persisting review for submission %s (cycle %d)", submission_id, review_cycle)

    # Fix #3: Deterministic review ID from workflow context for idempotency
    info = activity.info()
    review_id = str(
        uuid.uuid5(uuid.NAMESPACE_DNS, f"{info.workflow_run_id}-eval-{submission_id}-cycle-{review_cycle}")
    )

    pool = await _get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE submissions SET status = 'review' WHERE id = $1",
            submission_id,
        )
        # Fix #3: ON CONFLICT for idempotent inserts
        await conn.execute(
            """
            INSERT INTO reviews (id, submission_id, agent_feedback, suggested_score, agent_trace, created_at)
            VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6)
            ON CONFLICT (id) DO UPDATE SET
                agent_feedback = EXCLUDED.agent_feedback,
                suggested_score = EXCLUDED.suggested_score,
                agent_trace = EXCLUDED.agent_trace,
                created_at = EXCLUDED.created_at
            """,
            review_id,
            submission_id,
            feedback_json,
            suggested_score,
            agent_trace_json,
            datetime.now(timezone.utc),
        )

    activity.logger.info("Persisted review %s for submission %s", review_id, submission_id)
    return review_id


@activity.defn
async def notify_reviewer(
    submission_id: str,
    suggested_score: float,
) -> None:
    """Notify the reviewer that a submission is ready for review.

    Fetches the student name from the database.  Currently updates the
    submission status in Postgres.  Future versions will send email /
    WhatsApp / Slack notifications.
    """
    pool = await _get_db_pool()

    # Fetch student_name from the submissions table
    row = await pool.fetchrow(
        "SELECT student_name FROM submissions WHERE id = $1",
        submission_id,
    )
    student_name = row["student_name"] if row else ""

    activity.logger.info(
        "Notifying reviewer for submission %s (student=%s, score=%.1f)",
        submission_id,
        student_name,
        suggested_score,
    )

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE submissions SET status = 'review' WHERE id = $1",
            submission_id,
        )


@activity.defn
async def record_final_grade(
    submission_id: str,
    review_id: str,
    final_score: float,
    professor_notes: str,
    decision: str = "approved",
) -> None:
    """Record the final grade in the database.

    Updates the review record with the professor's decision and sets the
    submission status accordingly.  Future versions will perform LTI
    grade passback.
    """
    activity.logger.info(
        "Recording final grade for submission %s: score=%.1f decision=%s",
        submission_id,
        final_score,
        decision,
    )

    now = datetime.now(timezone.utc)
    pool = await _get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE reviews
            SET final_score = $1,
                professor_notes = $2,
                decision = $3,
                decided_at = $4
            WHERE id = $5
            """,
            final_score,
            professor_notes,
            decision,
            now,
            review_id,
        )
        await conn.execute(
            "UPDATE submissions SET status = $1 WHERE id = $2",
            decision,
            submission_id,
        )
