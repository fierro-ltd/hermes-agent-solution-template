"""Review endpoints — history and professor decision signalling."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from services.api import deps
from services.api.schemas import ReviewDecisionRequest, ReviewResponse

router = APIRouter(prefix="/submissions", tags=["reviews"])


# ---------------------------------------------------------------------------
# GET /api/submissions/{id}/reviews
# ---------------------------------------------------------------------------


@router.get("/{submission_id}/reviews", response_model=list[ReviewResponse])
async def list_reviews(submission_id: uuid.UUID) -> list[ReviewResponse]:
    """Return all review records for a submission (evaluation history)."""
    pool = await deps.get_pool()

    # Verify submission exists
    exists = await pool.fetchval(
        "SELECT 1 FROM submissions WHERE id = $1", submission_id
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Submission not found")

    rows = await pool.fetch(
        """
        SELECT id, submission_id, agent_feedback, suggested_score, final_score,
               professor_notes, decision, created_at, updated_at
        FROM reviews
        WHERE submission_id = $1
        ORDER BY created_at DESC
        """,
        submission_id,
    )
    return [ReviewResponse(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# POST /api/submissions/{id}/review
# ---------------------------------------------------------------------------


@router.post(
    "/{submission_id}/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_review_decision(
    submission_id: uuid.UUID,
    body: ReviewDecisionRequest,
) -> ReviewResponse:
    """Submit a professor's review decision and signal the Temporal workflow."""
    pool = await deps.get_pool()

    # Fetch submission + workflow handle
    sub = await pool.fetchrow(
        "SELECT id, workflow_id, status FROM submissions WHERE id = $1",
        submission_id,
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not sub["workflow_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active workflow for this submission",
        )

    # Map API decision values to DB/workflow values
    decision_map = {
        "approve": "approved",
        "reject": "rejected",
        "re_evaluate": "re_evaluate",
    }
    db_decision = decision_map[body.decision]

    # Persist the review record
    review_id = uuid.uuid4()
    row = await pool.fetchrow(
        """
        INSERT INTO reviews (id, submission_id, decision, final_score, professor_notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, submission_id, agent_feedback, suggested_score, final_score,
                  professor_notes, decision, created_at, updated_at
        """,
        review_id,
        submission_id,
        db_decision,
        body.final_score,
        body.notes,
    )

    # Map to workflow signal value (uses hyphen for re-evaluate)
    signal_decision_map = {
        "approve": "approved",
        "reject": "rejected",
        "re_evaluate": "re-evaluate",
    }

    # Signal the Temporal workflow
    from services.workers.schemas import ReviewDecision

    temporal = await deps.get_temporal_client()
    handle = temporal.get_workflow_handle(sub["workflow_id"])

    try:
        await handle.signal(
            "review_signal",
            ReviewDecision(
                review_id=str(review_id),
                decision=signal_decision_map[body.decision],
                final_score=body.final_score,
                professor_notes=body.notes or "",
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal workflow: {exc}",
        )

    # Update submission status
    new_status = {
        "approve": "approved",
        "reject": "rejected",
        "re_evaluate": "evaluating",
    }[body.decision]
    await pool.execute(
        "UPDATE submissions SET status = $1 WHERE id = $2",
        new_status,
        submission_id,
    )

    return ReviewResponse(**dict(row))
