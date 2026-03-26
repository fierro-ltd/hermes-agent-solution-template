"""Grading activities — AI evaluation, notification, and grade recording."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import httpx
from temporalio import activity

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


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@activity.defn
async def evaluate_submission(
    submission_id: str,
    rubric: str,
    content: str,
    professor_feedback: str | None = None,
) -> AgentFeedback:
    """Call the Hermes AI agent to evaluate a student submission.

    Sends the rubric and submission content to the Hermes chat completions
    endpoint, parses the structured JSON response, and persists a review
    record in Postgres.
    """
    activity.logger.info("Evaluating submission %s", submission_id)

    # Read provider/model settings from the database
    pool = await _get_db_pool()
    provider_settings = await _get_provider_settings(pool)
    model = provider_settings["model"]
    api_key = provider_settings["api_key"]

    activity.logger.info(
        "Using model=%s provider=%s for submission %s",
        model,
        provider_settings["provider"] or "(default)",
        submission_id,
    )

    system_prompt = _build_system_prompt(rubric, professor_feedback)

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ],
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{HERMES_API_URL}/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()

    raw_content = response.json()["choices"][0]["message"]["content"]
    feedback = _parse_agent_response(raw_content)

    # Persist to database
    agent_feedback_json = json.dumps({
        "suggested_score": feedback.suggested_score,
        "strengths": feedback.strengths,
        "weaknesses": feedback.weaknesses,
        "reasoning": feedback.reasoning,
    })

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE submissions SET status = 'review' WHERE id = $1",
            submission_id,
        )
        await conn.execute(
            """
            INSERT INTO reviews (submission_id, agent_feedback, suggested_score, created_at)
            VALUES ($1, $2::jsonb, $3, $4)
            """,
            submission_id,
            agent_feedback_json,
            feedback.suggested_score,
            datetime.now(timezone.utc),
        )

    activity.logger.info(
        "Submission %s evaluated: score=%.1f",
        submission_id,
        feedback.suggested_score,
    )
    return feedback


@activity.defn
async def notify_reviewer(
    submission_id: str,
    student_name: str,
    suggested_score: float,
) -> None:
    """Notify the reviewer that a submission is ready for review.

    Currently updates the submission status in Postgres.  Future versions
    will send email / WhatsApp / Slack notifications.
    """
    activity.logger.info(
        "Notifying reviewer for submission %s (student=%s, score=%.1f)",
        submission_id,
        student_name,
        suggested_score,
    )

    pool = await _get_db_pool()
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
) -> None:
    """Record the approved final grade in the database.

    Updates the review record with the professor's decision and sets the
    submission status to 'approved'.  Future versions will perform LTI
    grade passback.
    """
    activity.logger.info(
        "Recording final grade for submission %s: score=%.1f",
        submission_id,
        final_score,
    )

    now = datetime.now(timezone.utc)
    pool = await _get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE reviews
            SET final_score = $1,
                professor_notes = $2,
                decision = 'approved',
                decided_at = $3
            WHERE id = $4
            """,
            final_score,
            professor_notes,
            now,
            review_id,
        )
        await conn.execute(
            "UPDATE submissions SET status = 'approved' WHERE id = $1",
            submission_id,
        )
