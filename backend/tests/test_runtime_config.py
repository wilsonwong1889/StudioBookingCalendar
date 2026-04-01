import unittest
from types import SimpleNamespace

from app.config import RuntimeConfigurationError, validate_runtime_configuration


class RuntimeConfigurationTest(unittest.TestCase):
    def test_development_allows_local_stub_settings(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="development",
            SECRET_KEY="change-me-use-a-long-random-secret-key",
            APP_BASE_URL="http://localhost:8000",
            PAYMENT_BACKEND="stub",
            EMAIL_BACKEND="console",
            CELERY_TASK_ALWAYS_EAGER=True,
            cors_origins=["http://localhost:3000"],
            STRIPE_PUBLISHABLE_KEY="pk_test_change_me",
            STRIPE_SECRET_KEY="sk_test_change_me",
            STRIPE_WEBHOOK_SECRET="whsec_change_me",
            SENDGRID_API_KEY="SG.change-me",
            EMAIL_FROM="noreply@example.com",
            SMS_BACKEND="console",
            TWILIO_ACCOUNT_SID="",
            TWILIO_AUTH_TOKEN="",
            TWILIO_FROM_NUMBER="",
        )

        validate_runtime_configuration(settings_obj)

    def test_production_rejects_placeholder_settings(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="production",
            SECRET_KEY="change-me-use-a-long-random-secret-key",
            APP_BASE_URL="http://localhost:8000",
            PAYMENT_BACKEND="stub",
            EMAIL_BACKEND="console",
            CELERY_TASK_ALWAYS_EAGER=True,
            cors_origins=["http://localhost:3000"],
            STRIPE_PUBLISHABLE_KEY="pk_test_change_me",
            STRIPE_SECRET_KEY="sk_test_change_me",
            STRIPE_WEBHOOK_SECRET="whsec_change_me",
            SENDGRID_API_KEY="SG.change-me",
            EMAIL_FROM="noreply@example.com",
            SMS_BACKEND="console",
            TWILIO_ACCOUNT_SID="",
            TWILIO_AUTH_TOKEN="",
            TWILIO_FROM_NUMBER="",
        )

        with self.assertRaises(RuntimeConfigurationError):
            validate_runtime_configuration(settings_obj)

    def test_production_accepts_realistic_settings(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="production",
            SECRET_KEY="super-long-live-secret-with-entropy-1234567890",
            APP_BASE_URL="https://studio.example.ca",
            PAYMENT_BACKEND="stripe",
            EMAIL_BACKEND="sendgrid",
            SMTP_HOST="",
            SMTP_PORT=587,
            SMTP_USERNAME="",
            SMTP_PASSWORD="",
            CELERY_TASK_ALWAYS_EAGER=False,
            cors_origins=["https://studio.example.ca"],
            STRIPE_PUBLISHABLE_KEY="pk_live_realistic_value",
            STRIPE_SECRET_KEY="sk_live_realistic_value",
            STRIPE_WEBHOOK_SECRET="whsec_live_realistic_value",
            SENDGRID_API_KEY="SG.realistic_key_value",
            EMAIL_FROM="bookings@studio.example.ca",
            SMS_BACKEND="twilio",
            TWILIO_ACCOUNT_SID="ACrealisticvalue1234567890",
            TWILIO_AUTH_TOKEN="twilio_auth_token_realistic",
            TWILIO_FROM_NUMBER="+14035550123",
        )

        validate_runtime_configuration(settings_obj)

    def test_production_rejects_placeholder_twilio_settings(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="production",
            SECRET_KEY="super-long-live-secret-with-entropy-1234567890",
            APP_BASE_URL="https://studio.example.ca",
            PAYMENT_BACKEND="stripe",
            EMAIL_BACKEND="sendgrid",
            SMTP_HOST="",
            SMTP_PORT=587,
            SMTP_USERNAME="",
            SMTP_PASSWORD="",
            CELERY_TASK_ALWAYS_EAGER=False,
            cors_origins=["https://studio.example.ca"],
            STRIPE_PUBLISHABLE_KEY="pk_live_realistic_value",
            STRIPE_SECRET_KEY="sk_live_realistic_value",
            STRIPE_WEBHOOK_SECRET="whsec_live_realistic_value",
            SENDGRID_API_KEY="SG.realistic_key_value",
            EMAIL_FROM="bookings@studio.example.ca",
            SMS_BACKEND="twilio",
            TWILIO_ACCOUNT_SID="AC_change_me",
            TWILIO_AUTH_TOKEN="change_me",
            TWILIO_FROM_NUMBER="+15551234567",
        )

        with self.assertRaises(RuntimeConfigurationError):
            validate_runtime_configuration(settings_obj)

    def test_production_accepts_realistic_smtp_settings(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="production",
            SECRET_KEY="super-long-live-secret-with-entropy-1234567890",
            APP_BASE_URL="https://studio.example.ca",
            PAYMENT_BACKEND="stripe",
            EMAIL_BACKEND="smtp",
            SMTP_HOST="smtp.gmail.com",
            SMTP_PORT=587,
            SMTP_USERNAME="adminstudiobipoc@gmail.com",
            SMTP_PASSWORD="realistic_app_password_123",
            CELERY_TASK_ALWAYS_EAGER=False,
            cors_origins=["https://studio.example.ca"],
            STRIPE_PUBLISHABLE_KEY="pk_live_realistic_value",
            STRIPE_SECRET_KEY="sk_live_realistic_value",
            STRIPE_WEBHOOK_SECRET="whsec_live_realistic_value",
            SENDGRID_API_KEY="SG.change-me",
            EMAIL_FROM="adminstudiobipoc@gmail.com",
            SMS_BACKEND="console",
            TWILIO_ACCOUNT_SID="",
            TWILIO_AUTH_TOKEN="",
            TWILIO_FROM_NUMBER="",
        )

        validate_runtime_configuration(settings_obj)

    def test_production_rejects_missing_smtp_password(self) -> None:
        settings_obj = SimpleNamespace(
            APP_ENV="production",
            SECRET_KEY="super-long-live-secret-with-entropy-1234567890",
            APP_BASE_URL="https://studio.example.ca",
            PAYMENT_BACKEND="stripe",
            EMAIL_BACKEND="smtp",
            SMTP_HOST="smtp.gmail.com",
            SMTP_PORT=587,
            SMTP_USERNAME="adminstudiobipoc@gmail.com",
            SMTP_PASSWORD="",
            CELERY_TASK_ALWAYS_EAGER=False,
            cors_origins=["https://studio.example.ca"],
            STRIPE_PUBLISHABLE_KEY="pk_live_realistic_value",
            STRIPE_SECRET_KEY="sk_live_realistic_value",
            STRIPE_WEBHOOK_SECRET="whsec_live_realistic_value",
            SENDGRID_API_KEY="SG.change-me",
            EMAIL_FROM="adminstudiobipoc@gmail.com",
            SMS_BACKEND="console",
            TWILIO_ACCOUNT_SID="",
            TWILIO_AUTH_TOKEN="",
            TWILIO_FROM_NUMBER="",
        )

        with self.assertRaises(RuntimeConfigurationError):
            validate_runtime_configuration(settings_obj)


if __name__ == "__main__":
    unittest.main()
