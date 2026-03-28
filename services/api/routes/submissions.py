"""Submission CRUD and workflow triggering."""

from __future__ import annotations

import mimetypes
import os
import uuid
from pathlib import Path
from typing import Any

import json as _json

import httpx
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, status
from starlette.responses import FileResponse, StreamingResponse, JSONResponse
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

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_IMAGE_BYTES = 700 * 1024  # 700 KB — compress images larger than this (base64 adds ~33%)


def _compress_image(raw: bytes, mime: str) -> tuple[bytes, str]:
    """Compress an image to fit within MAX_IMAGE_BYTES.

    Converts PNG/WebP to JPEG and reduces quality progressively.
    Returns (compressed_bytes, output_mime_type).
    """
    import io
    from PIL import Image

    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    # Always output as JPEG for compression
    for quality in (85, 70, 50, 30):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        result = buf.getvalue()
        if len(result) <= MAX_IMAGE_BYTES:
            return result, "image/jpeg"

    # Last resort: resize to 50% and compress
    img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=50, optimize=True)
    return buf.getvalue(), "image/jpeg"


def _safe_upload_path(file_name: str) -> str:
    """Resolve an upload path and verify it stays within UPLOAD_DIR."""
    full_path = os.path.join(UPLOAD_DIR, file_name)
    if not os.path.realpath(full_path).startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return full_path


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
    """Upload a new submission (text, file, or image), persist it, and kick off grading."""
    if not content and not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either 'content' (text) or 'file'.",
        )

    submission_id = uuid.uuid4()
    submission_content = content or ""
    content_type = "text"
    file_path = None

    if file:
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )
        mime = file.content_type or ""
        if mime in IMAGE_MIME_TYPES:
            content_type = "image"
            # Validate that the file is actually a valid image
            try:
                if len(raw) > MAX_IMAGE_BYTES:
                    raw, mime = _compress_image(raw, mime)
                else:
                    # Validate even small images by opening with Pillow
                    import io
                    from PIL import Image
                    Image.open(io.BytesIO(raw)).verify()
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Uploaded file is not a valid image.",
                )
            ext = mimetypes.guess_extension(mime) or ".jpg"
            if ext == ".jpe":
                ext = ".jpg"
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            file_path = f"{submission_id}{ext}"
            full_path = _safe_upload_path(file_path)
            with open(full_path, "wb") as f:
                f.write(raw)
            submission_content = content or ""
        else:
            submission_content = raw.decode("utf-8", errors="replace")

    pool = await deps.get_pool()

    row = await pool.fetchrow(
        """
        INSERT INTO submissions (id, title, student_name, content, file_path, content_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING id, title, student_name, status, content_type, created_at, workflow_id
        """,
        submission_id,
        title,
        student_name,
        submission_content,
        file_path,
        content_type,
    )

    temporal = await deps.get_temporal_client()
    workflow_id = f"grading-{submission_id}"

    from services.workers.schemas import GradingParams

    await temporal.start_workflow(
        "GradingWorkflow",
        GradingParams(submission_id=str(submission_id)),
        id=workflow_id,
        task_queue=GRADING_TASK_QUEUE,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )

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
        content_type=content_type,
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
        SELECT id, title, student_name, status, content_type, created_at, workflow_id
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
        SELECT id, title, student_name, content, content_type, file_path, status, created_at, workflow_id
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
    # Fetch file path before deleting to clean up uploaded images
    sub_row = await pool.fetchrow(
        "SELECT file_path, content_type FROM submissions WHERE id = $1", submission_id
    )
    # Delete reviews first (foreign key constraint)
    await pool.execute("DELETE FROM reviews WHERE submission_id = $1", submission_id)
    result = await pool.execute("DELETE FROM submissions WHERE id = $1", submission_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Submission not found")
    # Clean up uploaded image file
    if sub_row and sub_row["content_type"] == "image" and sub_row["file_path"]:
        full_path = _safe_upload_path(sub_row["file_path"])
        if os.path.exists(full_path):
            os.remove(full_path)
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
# GET /api/submissions/{id}/image
# ---------------------------------------------------------------------------


@router.get("/{submission_id}/image")
async def get_submission_image(submission_id: uuid.UUID):
    """Serve the image file for an image submission."""
    pool = await deps.get_pool()
    row = await pool.fetchrow(
        "SELECT file_path, content_type FROM submissions WHERE id = $1",
        submission_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")
    if row["content_type"] != "image" or not row["file_path"]:
        raise HTTPException(status_code=404, detail="No image for this submission")

    full_path = _safe_upload_path(row["file_path"])
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    ext = os.path.splitext(row["file_path"])[1].lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return FileResponse(full_path, media_type=mime_map.get(ext, "image/jpeg"))


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
        "SELECT id, content, content_type, file_path, status FROM submissions WHERE id = $1",
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

    # Build user message — multipart for images, plain text otherwise
    if sub["content_type"] == "image" and sub["file_path"]:
        import base64
        full_path = _safe_upload_path(sub["file_path"])
        with open(full_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(sub["file_path"])[1].lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        mime = mime_map.get(ext, "image/jpeg")
        user_content: str | list = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_data}"}},
        ]
        if sub["content"]:
            user_content.append({"type": "text", "text": sub["content"]})
    else:
        user_content = sub["content"]

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
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
