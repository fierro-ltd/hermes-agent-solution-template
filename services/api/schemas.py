"""Pydantic request/response schemas for the API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


class SubmissionCreate(BaseModel):
    """Request body for creating a new submission."""

    title: str = Field(..., min_length=1, max_length=255)
    student_name: str = Field(..., min_length=1, max_length=255)
    content: str | None = Field(
        default=None,
        description="Text content of the submission (provide content or file, not both)",
    )
    # File uploads are handled via UploadFile in the route; this field is
    # used when the client sends JSON with inline content.


class SubmissionResponse(BaseModel):
    """Response body for a submission."""

    id: uuid.UUID
    title: str
    student_name: str
    status: str
    created_at: datetime
    workflow_id: str | None = None


class SubmissionListResponse(BaseModel):
    """Paginated list of submissions."""

    submissions: list[SubmissionResponse]
    total: int


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


class ReviewResponse(BaseModel):
    """Response body for a review record."""

    id: uuid.UUID
    submission_id: uuid.UUID
    agent_feedback: dict | str | None = None
    suggested_score: float | None = None
    final_score: float | None = None
    professor_notes: str | None = None
    decision: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class ReviewDecisionRequest(BaseModel):
    """Request body for a professor's review decision."""

    decision: Literal["approve", "reject", "re_evaluate"]
    final_score: Optional[float] = Field(
        default=None, ge=0, le=100, description="Override score (optional)"
    )
    notes: str | None = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


class SettingUpdate(BaseModel):
    """Request body for updating a single application setting."""

    key: str = Field(..., min_length=1, max_length=100)
    value: str = Field(..., max_length=2000)


class SettingResponse(BaseModel):
    """A single key-value setting."""

    key: str
    value: str


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

ALLOWED_PROVIDERS = {"openrouter", "opencode-go"}


class ProviderConfigUpdate(BaseModel):
    """Request body for updating LLM provider configuration."""

    provider: str = Field(..., min_length=1, max_length=50)
    model: str = Field(..., min_length=1, max_length=200)
    api_key: str = Field(default="", max_length=500)


class ProviderConfigResponse(BaseModel):
    """Response body for the current LLM provider configuration."""

    provider: str
    model: str
    api_key_set: bool
    api_key_hint: str


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class DashboardStats(BaseModel):
    """Aggregate statistics for the dashboard."""

    total_submissions: int = 0
    pending_reviews: int = 0
    approved_count: int = 0
    average_score: float | None = None
    agent_agreement_rate: float | None = None
