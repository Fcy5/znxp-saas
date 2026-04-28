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
    access_token_expire_minutes: int = 43200  # 30 天
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/znxp_saas"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # AI (ofox relay)
    ai_api_key: str = ""
    ai_base_url: str = "https://api.ofox.ai/v1"
    ai_model: str = "gemini-2.0-flash"


    # 阿里云百炼 DashScope（视频生成 wan2.7-i2v）
    dashscope_api_key: str = ""

    # 视频生成：Seedance 2.0（火山引擎 ARK）
    seedance_api_key: str = ""
    seedance_model: str = "doubao-seedance-2-0-260128"

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

    # Static file base URL (used to convert local paths to absolute URLs for Shopify)
    static_base_url: str = "https://znxp-sass.vqmjc.cc"

    # Google Merchant API + Google Ads
    google_client_id: str = ""
    google_client_secret: str = ""
    google_merchant_id: str = ""
    google_ads_customer_id: str = ""
    google_ads_developer_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
