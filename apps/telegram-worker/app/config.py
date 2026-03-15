from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = Field(default="0.0.0.0", alias="TELEGRAM_WORKER_HOST")
    port: int = Field(default=8080, alias="TELEGRAM_WORKER_PORT")

    database_url: str = Field(alias="DATABASE_URL")
    internal_api_token: str = Field(alias="INTERNAL_API_TOKEN")
    api_internal_url: str = Field(default="http://api:4000", alias="API_INTERNAL_URL")

    telegram_api_id: int = Field(alias="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(alias="TELEGRAM_API_HASH")
    telegram_session_encryption_key: str = Field(alias="TELEGRAM_SESSION_ENCRYPTION_KEY")

    telegram_initial_dialog_limit: int = Field(default=100, alias="TELEGRAM_INITIAL_DIALOG_LIMIT")
    telegram_initial_messages_per_dialog: int = Field(default=50, alias="TELEGRAM_INITIAL_MESSAGES_PER_DIALOG")
    telegram_worker_concurrency: int = Field(default=2, alias="TELEGRAM_WORKER_CONCURRENCY")


settings = Settings()
