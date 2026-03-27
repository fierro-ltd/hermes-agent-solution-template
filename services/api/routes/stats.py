"""Dashboard statistics endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from services.api import deps
from services.api.schemas import DashboardStats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=DashboardStats)
async def get_stats() -> DashboardStats:
    """Return aggregate dashboard statistics."""
    pool = await deps.get_pool()

    total = await pool.fetchval("SELECT count(*) FROM submissions") or 0

    pending = await pool.fetchval(
        "SELECT count(*) FROM submissions WHERE status IN ('review', 'evaluating', 'pending')"
    ) or 0

    approved = await pool.fetchval(
        "SELECT count(*) FROM submissions WHERE status = 'approved'"
    ) or 0

    rejected = await pool.fetchval(
        "SELECT count(*) FROM submissions WHERE status = 'rejected'"
    ) or 0

    completed = approved + rejected

    # Failed / expired submissions (any non-standard terminal state)
    failed = await pool.fetchval(
        "SELECT count(*) FROM submissions WHERE status NOT IN "
        "('pending', 'evaluating', 'review', 'approved', 'rejected')"
    ) or 0

    avg_score = await pool.fetchval(
        "SELECT avg(suggested_score) FROM reviews WHERE suggested_score IS NOT NULL"
    )

    # Average processing time: seconds between submission creation and first review
    avg_processing = await pool.fetchval(
        """
        SELECT avg(EXTRACT(EPOCH FROM (r.created_at - s.created_at)))
        FROM submissions s
        JOIN reviews r ON r.submission_id = s.id
        WHERE r.created_at IS NOT NULL AND s.created_at IS NOT NULL
        """
    )

    # Agent agreement rate: proportion of reviews where
    # the professor accepted the suggested score as-is.
    agreement = await pool.fetchrow(
        """
        SELECT
            count(*) FILTER (WHERE final_score IS NOT NULL AND suggested_score IS NOT NULL
                             AND final_score = suggested_score) AS agreed,
            count(*) FILTER (WHERE final_score IS NOT NULL AND suggested_score IS NOT NULL) AS total
        FROM reviews
        """
    )

    agreement_rate: float | None = None
    if agreement and agreement["total"] > 0:
        agreement_rate = round(agreement["agreed"] / agreement["total"], 4)

    return DashboardStats(
        total=total,
        completed=completed,
        failed=failed,
        pending_reviews=pending,
        approved=approved,
        rejected=rejected,
        avg_score=round(avg_score, 1) if avg_score is not None else None,
        avg_processing_seconds=round(avg_processing, 0) if avg_processing is not None else None,
        agent_agreement_rate=agreement_rate,
    )
