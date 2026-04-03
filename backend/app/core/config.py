from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "ZNXP SaaS"
    app_version: str = "2.0.0"
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 240
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/znxp_saas"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # AI (ofox relay)
    ai_api_key: str = ""
    ai_base_url: str = "https://api.ofox.ai/v1"
    ai_model: str = "gemini-2.0-flash"


    # Shopify OAuth
    shopify_client_id: str = ""
    shopify_client_secret: str = ""

    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
