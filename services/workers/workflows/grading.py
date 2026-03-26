"""Grading workflow — AI evaluation with human-in-the-loop review."""

from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from services.workers.activities.grading import (
        evaluate_submission,
        notify_reviewer,
        record_final_grade,
    )
    from services.workers.schemas import (
        AgentFeedback,
        GradingParams,
        GradingResult,
        ReviewDecision,
    )

AGENT_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=3,
)

REVIEW_WAIT_TIMEOUT = timedelta(days=7)


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
            self.review_cycles += 1
            self.status = "evaluating"

            # Step 1: AI evaluation
            agent_feedback = await workflow.execute_activity(
                evaluate_submission,
                args=[
                    params.submission_id,
                    params.rubric,
                    params.content,
                    professor_feedback,
                ],
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=AGENT_RETRY_POLICY,
            )

            self.status = "review"

            # Step 2: Notify reviewer
            await workflow.execute_activity(
                notify_reviewer,
                args=[
                    params.submission_id,
                    params.student_name,
                    agent_feedback.suggested_score,
                ],
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Step 3: Wait for professor signal (up to 7 days)
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

            # Step 4: Re-evaluate if requested
            if decision.decision == "re-evaluate":
                professor_feedback = decision.professor_notes
                workflow.logger.info(
                    "Re-evaluation requested for submission %s (cycle %d)",
                    params.submission_id,
                    self.review_cycles,
                )
                continue

            # Step 5: Record final grade
            self.status = "recording"
            await workflow.execute_activity(
                record_final_grade,
                args=[
                    params.submission_id,
                    decision.review_id,
                    decision.final_score if decision.final_score is not None else agent_feedback.suggested_score,
                    decision.professor_notes,
                ],
                start_to_close_timeout=timedelta(seconds=30),
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
