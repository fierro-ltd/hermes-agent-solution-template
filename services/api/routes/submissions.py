"""Submission CRUD and workflow triggering."""

from __future__ import annotations

import os
import uuid
from typing import Any

import json as _json

import httpx
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, status
from starlette.responses import StreamingResponse, JSONResponse
from temporalio.common import WorkflowIDReusePolicy

from services.api import deps
from services.api.schemas import (
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionResponse,
)

TEMPORAL_UI_URL = os.environ.get("TEMPORAL_UI_URL", "http://localhost:8233")

router = APIRouter(prefix="/submissions", tags=["submissions"])

GRADING_TASK_QUEUE = "grading-queue"


# ---------------------------------------------------------------------------
# POST /api/submissions
# ---------------------------------------------------------------------------


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    title: str = Form(...),
    student_name: str = Form(...),
    content: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
) -> SubmissionResponse:
    """Upload a new submission (text or file), persist it, and kick off grading."""
    if not content and not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either 'content' (text) or 'file'.",
        )

    # Read file content if provided
    submission_content = content or ""
    if file:
        raw = await file.read()
        submission_content = raw.decode("utf-8", errors="replace")

    submission_id = uuid.uuid4()
    pool = await deps.get_pool()

    # Insert submission row
    row = await pool.fetchrow(
        """
        INSERT INTO submissions (id, title, student_name, content, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id, title, student_name, status, created_at, workflow_id
        """,
        submission_id,
        title,
        student_name,
        submission_content,
    )

    # Start the Temporal grading workflow
    temporal = await deps.get_temporal_client()
    workflow_id = f"grading-{submission_id}"

    from services.workers.schemas import GradingParams

    # Fix #9: Idempotent workflow start — reject duplicate workflow IDs
    await temporal.start_workflow(
        "GradingWorkflow",
        GradingParams(submission_id=str(submission_id)),
        id=workflow_id,
        task_queue=GRADING_TASK_QUEUE,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )

    # Store workflow_id back on the submission
    await pool.execute(
        "UPDATE submissions SET workflow_id = $1, status = 'evaluating' WHERE id = $2",
        workflow_id,
        submission_id,
    )

    return SubmissionResponse(
        id=submission_id,
        title=title,
        student_name=student_name,
        status="evaluating",
        created_at=row["created_at"],
        workflow_id=workflow_id,
    )


# ---------------------------------------------------------------------------
# GET /api/submissions
# ---------------------------------------------------------------------------


@router.get("", response_model=SubmissionListResponse)
async def list_submissions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> SubmissionListResponse:
    """List all submissions with pagination."""
    pool = await deps.get_pool()

    total = await pool.fetchval("SELECT count(*) FROM submissions")
    rows = await pool.fetch(
        """
        SELECT id, title, student_name, status, created_at, workflow_id
        FROM submissions
        ORDER BY created_at DESC
        OFFSET $1 LIMIT $2
        """,
        offset,
        limit,
    )

    return SubmissionListResponse(
        submissions=[SubmissionResponse(**dict(r)) for r in rows],
        total=total,
    )


# ---------------------------------------------------------------------------
# GET /api/submissions/{id}
# ---------------------------------------------------------------------------


@router.get("/{submission_id}", response_model=dict[str, Any])
async def get_submission(submission_id: uuid.UUID) -> dict[str, Any]:
    """Get a single submission with its latest review."""
    pool = await deps.get_pool()

    row = await pool.fetchrow(
        """
        SELECT id, title, student_name, content, status, created_at, workflow_id
        FROM submissions WHERE id = $1
        """,
        submission_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission = dict(row)

    # Fetch latest review
    review_row = await pool.fetchrow(
        """
        SELECT id, submission_id, agent_feedback, suggested_score, final_score,
               professor_notes, decision, created_at, updated_at
        FROM reviews
        WHERE submission_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        submission_id,
    )

    submission["latest_review"] = dict(review_row) if review_row else None
    return submission


# ---------------------------------------------------------------------------
# GET /api/submissions/{id}/progress
# ---------------------------------------------------------------------------


@router.get("/{submission_id}/progress")
async def get_submission_progress(submission_id: uuid.UUID):
    """Return real workflow activity progress from Temporal history."""
    pool = await deps.get_pool()
    row = await pool.fetchrow(
        "SELECT workflow_id, status FROM submissions WHERE id = $1",
        submission_id,
    )
    if not row:
        raise HTTPException(404, "Submission not found")

    if not row["workflow_id"]:
        return {"status": row["status"], "activities": []}

    # Query Temporal for workflow history
    client = await deps.get_temporal_client()
    try:
        handle = client.get_workflow_handle(row["workflow_id"])
        # Fetch workflow history events
        activities: list[dict[str, Any]] = []
        async for event in handle.fetch_history_events():
            # Get event type as string — handle both enum and int protobuf values
            et = event.event_type
            et_name = et.name if hasattr(et, "name") else str(et)

            # Temporal protobuf event type integers:
            # 10 = ACTIVITY_TASK_SCHEDULED, 11 = STARTED, 12 = COMPLETED, 13 = FAILED
            et_int = et if isinstance(et, int) else getattr(et, "value", 0)

            if et_int == 10:  # ActivityTaskScheduled
                attr = event.activity_task_scheduled_event_attributes
                act_name = getattr(attr.activity_type, "name", "") or f"activity_{len(activities)+1}"
                activities.append({
                    "name": act_name,
                    "status": "scheduled",
                })
            elif et_int == 11:  # ActivityTaskStarted
                for a in reversed(activities):
                    if a["status"] == "scheduled":
                        a["status"] = "running"
                        break
            elif et_int == 12:  # ActivityTaskCompleted
                for a in reversed(activities):
                    if a["status"] in ("scheduled", "running"):
                        a["status"] = "completed"
                        break
            elif et_int == 13:  # ActivityTaskFailed
                for a in reversed(activities):
                    if a["status"] in ("scheduled", "running"):
                        a["status"] = "failed"
                        break

        # Check workflow status
        workflow_status = "running"
        try:
            desc = await handle.describe()
            st = desc.status
            workflow_status = (st.name.lower() if hasattr(st, "name") else str(st)).lower()
        except Exception:
            pass

        # Build Temporal UI deep link
        temporal_ui_url = (
            f"{TEMPORAL_UI_URL}/namespaces/default/workflows/{row['workflow_id']}"
        )

        return {
            "status": row["status"],
            "workflow_status": workflow_status,
            "activities": activities,
            "temporal_ui_url": temporal_ui_url,
        }
    except Exception as e:
        temporal_ui_url = (
            f"{TEMPORAL_UI_URL}/namespaces/default/workflows/{row['workflow_id']}"
        )
        return {
            "status": row["status"],
            "workflow_status": "unknown",
            "activities": [],
            "temporal_ui_url": temporal_ui_url,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# DELETE /api/submissions/{id}
# ---------------------------------------------------------------------------


@router.delete("/{submission_id}")
async def delete_submission(submission_id: uuid.UUID):
    """Delete a submission and its associated reviews."""
    pool = await deps.get_pool()
    # Delete reviews first (foreign key constraint)
    await pool.execute("DELETE FROM reviews WHERE submission_id = $1", submission_id)
    result = await pool.execute("DELETE FROM submissions WHERE id = $1", submission_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# GET /api/submissions/{id}/trace
# ---------------------------------------------------------------------------


@router.get("/{submission_id}/trace")
async def get_submission_trace(submission_id: uuid.UUID):
    """Return the agent trace for a submission's latest review."""
    pool = await deps.get_pool()

    row = await pool.fetchrow(
        """
        SELECT agent_trace
        FROM reviews
        WHERE submission_id = $1
        AND agent_trace IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        submission_id,
    )

    if not row or not row["agent_trace"]:
        return JSONResponse(status_code=404, content={"error": "No trace available"})

    trace = _json.loads(row["agent_trace"]) if isinstance(row["agent_trace"], str) else row["agent_trace"]
    return JSONResponse(content=trace)


# ---------------------------------------------------------------------------
# GET /api/submissions/{id}/stream
# ---------------------------------------------------------------------------


@router.get("/{submission_id}/stream")
async def stream_submission_evaluation(submission_id: uuid.UUID):
    """SSE endpoint that proxies Hermes streaming response to the frontend.

    Auth is handled by the router-level dependency (checks both bearer tokens
    and session cookies). EventSource sends cookies automatically, so this works.
    The stream result is ephemeral display-only — the Temporal worker's
    evaluation is canonical.
    """
    pool = await deps.get_pool()

    sub = await pool.fetchrow(
        "SELECT id, content, status FROM submissions WHERE id = $1",
        submission_id,
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub["status"] != "evaluating":
        raise HTTPException(status_code=400, detail="Submission is not being evaluated")

    rubric_row = await pool.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'rubric'"
    )
    rubric_text = ""
    if rubric_row:
        try:
            rubric = _json.loads(rubric_row["value"])
            rubric_text = _json.dumps(rubric, indent=2)
        except Exception:
            rubric_text = str(rubric_row["value"])

    # Build system prompt — simplified version for display-only streaming.
    # Intentionally diverges from _build_system_prompt() in grading.py because
    # this stream is ephemeral (result is discarded). The Temporal worker uses
    # the full prompt with professor feedback for the canonical evaluation.
    system_prompt = (
        "You are an expert academic grading assistant. "
        "Evaluate the following student submission against the rubric.\n\n"
        f"RUBRIC:\n{rubric_text}\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": sub["content"]},
    ]

    hermes_url = os.environ.get("HERMES_API_URL", "http://hermes-gateway:8642")
    hermes_key = os.environ.get("HERMES_API_KEY", "")

    headers_dict = {"Content-Type": "application/json"}
    if hermes_key:
        headers_dict["Authorization"] = f"Bearer {hermes_key}"

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{hermes_url}/v1/chat/completions",
                    json={"model": "hermes-agent", "messages": messages, "stream": True},
                    headers=headers_dict,
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = _json.loads(data)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                yield f"data: {_json.dumps({'type': 'delta', 'content': content})}\n\n"
                        except Exception:
                            continue
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("SSE stream error: %s", e, exc_info=True)
            yield f"data: {_json.dumps({'type': 'error', 'message': 'Streaming failed'})}\n\n"
        finally:
            yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
