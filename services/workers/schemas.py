"""Data models for the grading workflow."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field


class SubmissionStatus(str, enum.Enum):
    PENDING = "pending"
    EVALUATING = "evaluating"
    REVIEW = "review"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class AgentFeedback:
    """Structured feedback returned by the AI grading agent."""

    suggested_score: float
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    reasoning: str = ""


@dataclass
class GradingParams:
    """Input parameters for the GradingWorkflow."""

    submission_id: str


@dataclass
class ReviewDecision:
    """Signal payload sent by the professor after reviewing agent feedback."""

    review_id: str
    decision: str  # "approved" or "re-evaluate"
    final_score: float | None = None
    professor_notes: str = ""


@dataclass
class GradingResult:
    """Final output of the GradingWorkflow."""

    submission_id: str
    status: str
    agent_feedback: AgentFeedback | None = None
    final_score: float | None = None
    professor_notes: str = ""
    review_cycles: int = 0
