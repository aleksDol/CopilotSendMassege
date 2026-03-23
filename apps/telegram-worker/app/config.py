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
    telegram_auto_sync_enabled: bool = Field(default=True, alias="TELEGRAM_AUTO_SYNC_ENABLED")
    telegram_auto_sync_interval_seconds: int = Field(default=15, alias="TELEGRAM_AUTO_SYNC_INTERVAL_SECONDS")
    # Auto-sync must be wide enough to catch newly-started dialogs reliably.
    # Manual sync uses the "initial" limits (100/50) because it sends no payload.
    telegram_auto_sync_dialog_limit: int = Field(default=100, alias="TELEGRAM_AUTO_SYNC_DIALOG_LIMIT")
    telegram_auto_sync_messages_per_dialog: int = Field(default=20, alias="TELEGRAM_AUTO_SYNC_MESSAGES_PER_DIALOG")

    telegram_live_listener_enabled: bool = Field(default=True, alias="TELEGRAM_LIVE_LISTENER_ENABLED")
    telegram_live_listener_refresh_seconds: int = Field(default=20, alias="TELEGRAM_LIVE_LISTENER_REFRESH_SECONDS")
    telegram_live_listener_log_events: bool = Field(default=False, alias="TELEGRAM_LIVE_LISTENER_LOG_EVENTS")
    telegram_min_send_interval_ms: int = Field(default=2000, alias="TELEGRAM_MIN_SEND_INTERVAL_MS")
    telegram_max_sends_per_minute: int = Field(default=20, alias="TELEGRAM_MAX_SENDS_PER_MINUTE")
    telegram_max_sends_per_5_minutes: int = Field(default=60, alias="TELEGRAM_MAX_SENDS_PER_5_MINUTES")
    telegram_max_new_conversations_per_hour: int = Field(default=10, alias="TELEGRAM_MAX_NEW_CONVERSATIONS_PER_HOUR")
    telegram_send_retry_max_attempts: int = Field(default=2, alias="TELEGRAM_SEND_RETRY_MAX_ATTEMPTS")
    telegram_safety_mode_error_threshold: int = Field(default=5, alias="TELEGRAM_SAFETY_MODE_ERROR_THRESHOLD")
    telegram_safety_mode_cooldown_minutes: int = Field(default=30, alias="TELEGRAM_SAFETY_MODE_COOLDOWN_MINUTES")
    telegram_sync_min_interval_seconds: int = Field(default=30, alias="TELEGRAM_SYNC_MIN_INTERVAL_SECONDS")
    telegram_max_concurrent_syncs_per_account: int = Field(default=1, alias="TELEGRAM_MAX_CONCURRENT_SYNCS_PER_ACCOUNT")


settings = Settings()
