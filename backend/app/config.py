from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    STRIPE_SECRET_KEY: str = "sk_test_placeholder"
    STRIPE_WEBHOOK_SECRET: str = "whsec_placeholder"

    SENDGRID_API_KEY: str = "SG.placeholder"
    EMAIL_FROM: str = "noreply@yourstudio.com"

    BUSINESS_TIMEZONE: str = "America/New_York"
    HOURLY_RATE_CENTS: int = 5000

    class Config:
        env_file = ".env"

settings = Settings()
