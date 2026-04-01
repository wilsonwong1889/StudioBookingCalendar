#!/bin/sh
set -eu

python scripts/wait_for_services.py postgres
python scripts/wait_for_services.py redis
alembic upgrade head

if [ "${AUTO_SEED_DATA:-true}" = "true" ]; then
  python scripts/seed_week2.py
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
