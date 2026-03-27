"""Application settings endpoints (rubric, model config, etc.)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from services.api import deps
from services.api.schemas import (
    ALLOWED_PROVIDERS,
    ProviderConfigResponse,
    ProviderConfigUpdate,
    SettingResponse,
    SettingUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

# Provider-related setting keys
_PROVIDER_KEY = "hermes_provider"
_MODEL_KEY = "hermes_model"
_API_KEY_KEY = "hermes_api_key"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mask_api_key(key: str) -> str:
    """Return the last 4 characters of an API key, masked with dots."""
    if not key or len(key) < 4:
        return ""
    return f"{'*' * 4}{key[-4:]}"


async def _get_setting(pool, key: str) -> str:
    """Fetch a single setting value, returning empty string if not found."""
    row = await pool.fetchrow(
        "SELECT value FROM app_settings WHERE key = $1", key
    )
    return row["value"] if row else ""


async def _upsert_setting(pool, key: str, value: str) -> None:
    """Insert or update a single setting."""
    await pool.execute(
        """
        INSERT INTO app_settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        key,
        value,
    )


# ---------------------------------------------------------------------------
# GET /api/settings
# ---------------------------------------------------------------------------


@router.get("", response_model=list[SettingResponse])
async def get_settings() -> list[SettingResponse]:
    """Return all application settings (excluding sensitive keys like API keys)."""
    pool = await deps.get_pool()
    rows = await pool.fetch(
        "SELECT key, value FROM app_settings WHERE key != $1 ORDER BY key",
        _API_KEY_KEY,
    )
    return [SettingResponse(key=r["key"], value=r["value"]) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/settings/provider  (defined BEFORE /{key} to avoid path conflict)
# ---------------------------------------------------------------------------


@router.get("/provider", response_model=ProviderConfigResponse)
async def get_provider_config() -> ProviderConfigResponse:
    """Return the current LLM provider configuration.

    Never returns the full API key -- only whether one is set and a masked hint.
    """
    pool = await deps.get_pool()
    provider = await _get_setting(pool, _PROVIDER_KEY)
    model = await _get_setting(pool, _MODEL_KEY)
    api_key = await _get_setting(pool, _API_KEY_KEY)

    return ProviderConfigResponse(
        provider=provider,
        model=model,
        api_key_set=bool(api_key),
        api_key_hint=_mask_api_key(api_key),
    )


# ---------------------------------------------------------------------------
# PUT /api/settings/provider  (defined BEFORE /{key} to avoid path conflict)
# ---------------------------------------------------------------------------


@router.put("/provider", response_model=ProviderConfigResponse)
async def update_provider_config(body: ProviderConfigUpdate) -> ProviderConfigResponse:
    """Update the LLM provider, model, and optionally the API key.

    Only providers in the allowed list ("openrouter", "opencode-go") are accepted.
    If ``api_key`` is an empty string, the existing key is preserved.
    """
    if body.provider not in ALLOWED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider must be one of: {', '.join(sorted(ALLOWED_PROVIDERS))}",
        )

    pool = await deps.get_pool()

    await _upsert_setting(pool, _PROVIDER_KEY, body.provider)
    await _upsert_setting(pool, _MODEL_KEY, body.model)

    # Only overwrite the API key if a non-empty value was provided
    if body.api_key:
        await _upsert_setting(pool, _API_KEY_KEY, body.api_key)

    # Read back current state for response
    api_key = await _get_setting(pool, _API_KEY_KEY)

    return ProviderConfigResponse(
        provider=body.provider,
        model=body.model,
        api_key_set=bool(api_key),
        api_key_hint=_mask_api_key(api_key),
    )


# ---------------------------------------------------------------------------
# PUT /api/settings/{key}
# ---------------------------------------------------------------------------


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(key: str, body: SettingUpdate) -> SettingResponse:
    """Create or update a single setting by key."""
    if body.key != key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Key in URL must match key in request body",
        )

    # Prevent direct writes to provider config keys via this endpoint
    if key in {_PROVIDER_KEY, _MODEL_KEY, _API_KEY_KEY}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the /api/settings/provider endpoint for provider configuration",
        )

    pool = await deps.get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO app_settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        RETURNING key, value
        """,
        key,
        body.value,
    )
    return SettingResponse(key=row["key"], value=row["value"])
