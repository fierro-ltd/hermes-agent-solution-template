"""Grading workflow — AI evaluation with human-in-the-loop review."""

from __future__ import annotations

import json
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from services.workers.activities.grading import (
        evaluate_submission,
        notify_reviewer,
        persist_review,
        record_final_grade,
    )
    from services.workers.schemas import (
        AgentFeedback,
        GradingParams,
        GradingResult,
        ReviewDecision,
    )
    # Fix #6: Import shared constants instead of duplicating them
    from services.workers.worker_common import AGENT_RETRY_POLICY, REVIEW_WAIT_TIMEOUT

# Fix #8: Cap the number of re-evaluation cycles
MAX_REVIEW_CYCLES = 10


@workflow.defn
class GradingWorkflow:
    """Orchestrates submission grading: evaluate -> review -> record.

    The workflow calls the AI agent to evaluate a submission, notifies a
    professor to review the suggested grade, then waits for a signal.  If
    the professor asks for re-evaluation the loop restarts with their
    feedback.  Once approved the final grade is recorded.
    """

    def __init__(self) -> None:
        self.review_decision: ReviewDecision | None = None
        self.status: str = "pending"
        self.review_cycles: int = 0

    # ------------------------------------------------------------------
    # Signal & query
    # ------------------------------------------------------------------

    @workflow.signal
    async def review_signal(self, decision: ReviewDecision) -> None:
        """Receive the professor's review decision."""
        self.review_decision = decision

    @workflow.query
    def get_status(self) -> str:
        """Return the current workflow status."""
        return self.status

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    @workflow.run
    async def run(self, params: GradingParams) -> GradingResult:
        professor_feedback: str | None = None
        agent_feedback: AgentFeedback | None = None

        while True:
            # Fix #8: Guard against unbounded re-evaluation cycles
            if self.review_cycles >= MAX_REVIEW_CYCLES:
                workflow.logger.warning(
                    "Max review cycles (%d) reached for submission %s",
                    MAX_REVIEW_CYCLES,
                    params.submission_id,
                )
                self.status = "max_cycles_reached"
                return GradingResult(
                    submission_id=params.submission_id,
                    status="max_cycles_reached",
                    agent_feedback=agent_feedback,
                    review_cycles=self.review_cycles,
                )

            self.review_cycles += 1
            self.status = "evaluating"

            # Step 1: AI evaluation (Fix #5: proper timeouts + heartbeat)
            agent_feedback = await workflow.execute_activity(
                evaluate_submission,
                args=[
                    params.submission_id,
                    professor_feedback,
                ],
                schedule_to_close_timeout=timedelta(minutes=25),
                start_to_close_timeout=timedelta(seconds=180),
                heartbeat_timeout=timedelta(seconds=30),
                retry_policy=AGENT_RETRY_POLICY,
            )

            # Step 2: Persist review (Fix #7: split from evaluate_submission)
            feedback_json = json.dumps({
                "suggested_score": agent_feedback.suggested_score,
                "strengths": agent_feedback.strengths,
                "weaknesses": agent_feedback.weaknesses,
                "reasoning": agent_feedback.reasoning,
            })
            review_id = await workflow.execute_activity(
                persist_review,
                args=[
                    params.submission_id,
                    feedback_json,
                    agent_feedback.suggested_score,
                    self.review_cycles,
                ],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(
                    maximum_attempts=5,
                    initial_interval=timedelta(seconds=2),
                    maximum_interval=timedelta(seconds=30),
                ),
            )

            self.status = "review"

            # Step 3: Notify reviewer (Fix #5: add retry policy)
            await workflow.execute_activity(
                notify_reviewer,
                args=[
                    params.submission_id,
                    agent_feedback.suggested_score,
                ],
                schedule_to_close_timeout=timedelta(minutes=5),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(
                    maximum_attempts=5,
                    initial_interval=timedelta(seconds=2),
                    maximum_interval=timedelta(seconds=30),
                ),
            )

            # Step 4: Wait for professor signal (up to 7 days)
            self.review_decision = None

            try:
                await workflow.wait_condition(
                    lambda: self.review_decision is not None,
                    timeout=REVIEW_WAIT_TIMEOUT,
                )
            except TimeoutError:
                workflow.logger.warning(
                    "Review timed out for submission %s", params.submission_id
                )
                self.status = "timed_out"
                return GradingResult(
                    submission_id=params.submission_id,
                    status="timed_out",
                    agent_feedback=agent_feedback,
                    review_cycles=self.review_cycles,
                )

            decision = self.review_decision
            assert decision is not None

            # Step 5: Re-evaluate if requested
            if decision.decision == "re-evaluate":
                professor_feedback = decision.professor_notes
                workflow.logger.info(
                    "Re-evaluation requested for submission %s (cycle %d)",
                    params.submission_id,
                    self.review_cycles,
                )
                continue

            # Step 5b: Handle rejection explicitly
            if decision.decision == "rejected":
                self.status = "rejected"
                await workflow.execute_activity(
                    record_final_grade,
                    args=[
                        params.submission_id,
                        review_id,
                        decision.final_score if decision.final_score is not None else agent_feedback.suggested_score,
                        decision.professor_notes,
                        "rejected",
                    ],
                    start_to_close_timeout=timedelta(seconds=30),
                    schedule_to_close_timeout=timedelta(minutes=5),
                    retry_policy=RetryPolicy(
                        maximum_attempts=5,
                        initial_interval=timedelta(seconds=2),
                        maximum_interval=timedelta(seconds=30),
                    ),
                )
                return GradingResult(
                    submission_id=params.submission_id,
                    status="rejected",
                    agent_feedback=agent_feedback,
                    final_score=decision.final_score if decision.final_score is not None else agent_feedback.suggested_score,
                    professor_notes=decision.professor_notes,
                    review_cycles=self.review_cycles,
                )

            # Step 6: Record final grade (Fix #5: add retry policy)
            self.status = "recording"
            await workflow.execute_activity(
                record_final_grade,
                args=[
                    params.submission_id,
                    decision.review_id,
                    decision.final_score if decision.final_score is not None else agent_feedback.suggested_score,
                    decision.professor_notes,
                    "approved",
                ],
                schedule_to_close_timeout=timedelta(minutes=5),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(
                    maximum_attempts=5,
                    initial_interval=timedelta(seconds=2),
                    maximum_interval=timedelta(seconds=30),
                ),
            )

            self.status = "approved"
            return GradingResult(
                submission_id=params.submission_id,
                status="approved",
                agent_feedback=agent_feedback,
                final_score=decision.final_score if decision.final_score is not None else agent_feedback.suggested_score,
                professor_notes=decision.professor_notes,
                review_cycles=self.review_cycles,
            )
