import os
import sys
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from sqlalchemy import create_engine, text


class GoogleAuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.admin_database_url = os.environ.get(
            "TEST_ADMIN_DATABASE_URL",
            "postgresql://postgres:password@localhost:5432/postgres",
        )
        cls.test_database_name = f"studio_google_{uuid4().hex[:8]}"
        cls.test_database_url = os.environ.get(
            "TEST_DATABASE_URL",
            f"postgresql://postgres:password@localhost:5432/{cls.test_database_name}",
        )
        cls._create_database()

        os.environ["DATABASE_URL"] = cls.test_database_url
        os.environ["SECRET_KEY"] = "google-auth-test-secret"
        os.environ["SUPABASE_URL"] = "https://example.supabase.co"
        os.environ["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_key"
        os.environ["CELERY_TASK_ALWAYS_EAGER"] = "true"

        for module_name in list(sys.modules):
            if module_name == "app" or module_name.startswith("app."):
                sys.modules.pop(module_name)

        from app.database import Base, SessionLocal, engine
        from app.main import app
        from app.models.user import User
        from fastapi.testclient import TestClient

        cls.Base = Base
        cls.SessionLocal = SessionLocal
        cls.engine = engine
        cls.User = User
        cls.Base.metadata.create_all(bind=cls.engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()
        cls._drop_database()

    @classmethod
    def _create_database(cls) -> None:
        admin_engine = create_engine(cls.admin_database_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {cls.test_database_name}"))
            conn.execute(text(f"CREATE DATABASE {cls.test_database_name}"))
        admin_engine.dispose()

    @classmethod
    def _drop_database(cls) -> None:
        admin_engine = create_engine(cls.admin_database_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {cls.test_database_name}"))
        admin_engine.dispose()

    def setUp(self) -> None:
        with self.engine.begin() as connection:
            for table in reversed(self.Base.metadata.sorted_tables):
                connection.execute(table.delete())

    def test_google_exchange_creates_local_user_and_returns_access_token(self) -> None:
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            "email": "gmail-user@example.com",
            "user_metadata": {"full_name": "Gmail User", "phone": "4035550101"},
        }

        with patch("app.routers.auth.httpx.get", return_value=response) as mocked_get:
            result = self.client.post(
                "/api/auth/google/exchange",
                json={"access_token": "google-access-token"},
            )

        self.assertEqual(result.status_code, 200, result.text)
        payload = result.json()
        self.assertTrue(payload["access_token"])
        mocked_get.assert_called_once()

        with self.SessionLocal() as db:
            user = db.query(self.User).filter(self.User.email == "gmail-user@example.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.full_name, "Gmail User")
            self.assertEqual(user.phone, "4035550101")


if __name__ == "__main__":
    unittest.main()
