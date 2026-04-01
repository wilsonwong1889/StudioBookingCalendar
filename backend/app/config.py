from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[1]
PLACEHOLDER_MARKERS = ("change_me", "change-me", "placeholder", "example.com", "studio.local")


class RuntimeConfigurationError(RuntimeError):
    pass


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    APP_ENV: str = "development"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    APP_BASE_URL: str = "http://127.0.0.1:8000"
    ALLOWED_CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_SECRET_KEY: str = "sk_test_placeholder"
    STRIPE_WEBHOOK_SECRET: str = "whsec_placeholder"
    PAYMENT_BACKEND: str = "stub"
    STRIPE_WEBHOOK_TOLERANCE_SECONDS: int = 300

    SENDGRID_API_KEY: str = "SG.placeholder"
    EMAIL_FROM: str = "noreply@yourstudio.com"
    EMAIL_REPLY_TO: str = ""
    EMAIL_BACKEND: str = "console"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_TIMEOUT_SECONDS: int = 20
    SMS_BACKEND: str = "console"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    TWO_FACTOR_CODE_EXPIRE_MINUTES: int = 10

    REDIS_URL: str = "redis://localhost:6379/0"
    RESERVATION_HOLD_MINUTES: int = 5
    CELERY_TASK_ALWAYS_EAGER: bool = True
    REMINDER_HOURS_BEFORE: str = "24,5,1"
    REMINDER_DISPATCH_INTERVAL_MINUTES: int = 30
    PENDING_BOOKING_CLEANUP_INTERVAL_MINUTES: int = 1
    PENDING_BOOKING_EXPIRY_MINUTES: int = 5
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    AUTH_RATE_LIMIT_MAX_REQUESTS: int = 20
    BOOKING_RATE_LIMIT_MAX_REQUESTS: int = 30
    ADMIN_RATE_LIMIT_MAX_REQUESTS: int = 40

    BUSINESS_TIMEZONE: str = "America/Edmonton"
    BOOKING_OPEN_HOUR: int = 10
    BOOKING_CLOSE_HOUR: int = 18
    HOURLY_RATE_CENTS: int = 5000
    DEFAULT_CURRENCY: str = "CAD"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        extra="ignore",
    )

    @property
    def reminder_hours_before_list(self) -> list[int]:
        values = []
        for raw_value in self.REMINDER_HOURS_BEFORE.split(","):
            trimmed = raw_value.strip()
            if not trimmed:
                continue
            values.append(int(trimmed))
        return values

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_CORS_ORIGINS.split(",") if origin.strip()]


def _looks_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def validate_runtime_configuration(settings_obj: Optional[Settings] = None) -> None:
    current = settings_obj or settings
    environment = current.APP_ENV.lower().strip()
    if environment != "production":
        return

    errors: list[str] = []

    if len(current.SECRET_KEY) < 32 or _looks_placeholder(current.SECRET_KEY):
        errors.append("SECRET_KEY must be a strong non-placeholder value in production")
    if not current.APP_BASE_URL.startswith("https://"):
        errors.append("APP_BASE_URL must use https in production")
    if current.PAYMENT_BACKEND != "stripe":
        errors.append("PAYMENT_BACKEND must be stripe in production")
    if current.EMAIL_BACKEND not in {"sendgrid", "smtp"}:
        errors.append("EMAIL_BACKEND must be sendgrid or smtp in production")
    if current.CELERY_TASK_ALWAYS_EAGER:
        errors.append("CELERY_TASK_ALWAYS_EAGER must be false in production")
    if any("localhost" in origin or "127.0.0.1" in origin for origin in current.cors_origins):
        errors.append("ALLOWED_CORS_ORIGINS must not include localhost in production")
    if not current.STRIPE_PUBLISHABLE_KEY or _looks_placeholder(current.STRIPE_PUBLISHABLE_KEY):
        errors.append("STRIPE_PUBLISHABLE_KEY must be configured in production")
    if _looks_placeholder(current.STRIPE_SECRET_KEY):
        errors.append("STRIPE_SECRET_KEY must be configured in production")
    if _looks_placeholder(current.STRIPE_WEBHOOK_SECRET):
        errors.append("STRIPE_WEBHOOK_SECRET must be configured in production")
    if current.EMAIL_BACKEND == "sendgrid":
        if _looks_placeholder(current.SENDGRID_API_KEY):
            errors.append("SENDGRID_API_KEY must be configured in production")
    if current.EMAIL_BACKEND == "smtp":
        if not current.SMTP_HOST or _looks_placeholder(current.SMTP_HOST):
            errors.append("SMTP_HOST must be configured when EMAIL_BACKEND is smtp")
        if not current.SMTP_PORT or current.SMTP_PORT <= 0:
            errors.append("SMTP_PORT must be a positive integer when EMAIL_BACKEND is smtp")
        if not current.SMTP_USERNAME or _looks_placeholder(current.SMTP_USERNAME):
            errors.append("SMTP_USERNAME must be configured when EMAIL_BACKEND is smtp")
        if not current.SMTP_PASSWORD or _looks_placeholder(current.SMTP_PASSWORD):
            errors.append("SMTP_PASSWORD must be configured when EMAIL_BACKEND is smtp")
    if _looks_placeholder(current.EMAIL_FROM):
        errors.append("EMAIL_FROM must use a real sender address in production")
    if current.SMS_BACKEND == "twilio":
        if not current.TWILIO_ACCOUNT_SID or _looks_placeholder(current.TWILIO_ACCOUNT_SID):
            errors.append("TWILIO_ACCOUNT_SID must be configured when SMS_BACKEND is twilio")
        if not current.TWILIO_AUTH_TOKEN or _looks_placeholder(current.TWILIO_AUTH_TOKEN):
            errors.append("TWILIO_AUTH_TOKEN must be configured when SMS_BACKEND is twilio")
        if not current.TWILIO_FROM_NUMBER or _looks_placeholder(current.TWILIO_FROM_NUMBER):
            errors.append("TWILIO_FROM_NUMBER must be configured when SMS_BACKEND is twilio")

    if errors:
        raise RuntimeConfigurationError("; ".join(errors))

settings = Settings()
