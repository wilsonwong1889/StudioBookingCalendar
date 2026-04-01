import os
import sys
import time

import redis
from sqlalchemy import create_engine, text


def wait_for_postgres(timeout_seconds: int) -> None:
    database_url = os.environ["DATABASE_URL"]
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        try:
            engine = create_engine(database_url)
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            print("Postgres ready")
            return
        except Exception as exc:  # pragma: no cover - startup helper
            print(f"Waiting for Postgres: {exc}")
            time.sleep(2)

    raise TimeoutError("Timed out waiting for Postgres")


def wait_for_redis(timeout_seconds: int) -> None:
    redis_url = os.environ["REDIS_URL"]
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        try:
            client = redis.Redis.from_url(redis_url, decode_responses=True)
            client.ping()
            print("Redis ready")
            return
        except Exception as exc:  # pragma: no cover - startup helper
            print(f"Waiting for Redis: {exc}")
            time.sleep(2)

    raise TimeoutError("Timed out waiting for Redis")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"postgres", "redis"}:
        raise SystemExit("Usage: python scripts/wait_for_services.py [postgres|redis]")

    timeout_seconds = int(os.environ.get("STARTUP_WAIT_TIMEOUT_SECONDS", "90"))
    if sys.argv[1] == "postgres":
        wait_for_postgres(timeout_seconds)
        return
    wait_for_redis(timeout_seconds)


if __name__ == "__main__":
    main()
