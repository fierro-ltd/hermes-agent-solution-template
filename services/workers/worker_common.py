"""Shared constants and worker factory for the grading worker."""

from __future__ import annotations

from datetime import timedelta

from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

from services.workers.activities.grading import (
    evaluate_submission,
    notify_reviewer,
    persist_review,
    record_final_grade,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GRADING_TASK_QUEUE = "grading-queue"

# Fix #6: Single source of truth for retry policy
AGENT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
    backoff_coefficient=2.0,
)

DEFAULT_ACTIVITY_TIMEOUT = timedelta(seconds=120)

REVIEW_WAIT_TIMEOUT = timedelta(days=7)

# ---------------------------------------------------------------------------
# Activity registry
# ---------------------------------------------------------------------------

ACTIVITIES = [
    evaluate_submission,
    persist_review,
    notify_reviewer,
    record_final_grade,
]

# ---------------------------------------------------------------------------
# Worker factory
# ---------------------------------------------------------------------------


async def create_worker(client: Client, task_queue: str) -> Worker:
    """Create a Temporal worker with all grading workflows and activities."""
    from services.workers.workflows.grading import GradingWorkflow

    return Worker(
        client,
        task_queue=task_queue,
        workflows=[GradingWorkflow],
        activities=ACTIVITIES,
    )
