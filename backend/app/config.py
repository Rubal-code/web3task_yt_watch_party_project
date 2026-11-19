"""Application settings loaded from environment variables.

Uses pydantic-settings for type-safe, validated configuration.
All settings can be overridden via environment variables or a .env file.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the Watch Party backend."""

    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/watchparty"
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    PORT: int = 8000
    SECRET_KEY: str = "change-me-in-production"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()