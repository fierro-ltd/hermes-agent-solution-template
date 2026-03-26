"""Centralized configuration from environment variables.

Uses a factory function so env vars are read at instantiation time, not at
import time.  This makes it straightforward to override values in tests by
either patching ``os.environ`` before calling ``load_config()`` or by
constructing ``Config(...)`` directly with explicit arguments.
"""

import os
from dataclasses import dataclass, field


def _env(key: str, default: str) -> str:
    """Read an env var -- called at Config instantiation, not import time."""
    return os.getenv(key, default)


def _env_int(key: str, default: str) -> int:
    return int(os.getenv(key, default))


@dataclass(frozen=True)
class Config:
    # Database
    database_url: str = field(default_factory=lambda: _env(
        "DATABASE_URL",
        "postgresql://app_user:app_password@localhost:5432/app_db",
    ))

    # Temporal
    temporal_address: str = field(default_factory=lambda: _env(
        "TEMPORAL_ADDRESS", "localhost:7233"
    ))
    task_queue: str = field(default_factory=lambda: _env("TASK_QUEUE", "grading"))

    # Hermes Agent
    hermes_api_url: str = field(default_factory=lambda: _env(
        "HERMES_API_URL", "http://localhost:8088"
    ))
    hermes_api_key: str = field(default_factory=lambda: _env("HERMES_API_KEY", ""))

    # Authentication (Clerk)
    clerk_jwks_url: str = field(default_factory=lambda: _env(
        "CLERK_JWKS_URL",
        "https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json",
    ))

    # Grading workflow
    grading_timeout_days: int = field(default_factory=lambda: _env_int(
        "GRADING_TIMEOUT_DAYS", "7"
    ))

    # File uploads
    upload_dir: str = field(default_factory=lambda: _env("UPLOAD_DIR", "/app/uploads"))


def load_config() -> Config:
    """Create a Config reading current environment variables."""
    return Config()


config = load_config()
