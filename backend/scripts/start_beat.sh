#!/bin/sh
set -eu

python scripts/wait_for_services.py postgres
python scripts/wait_for_services.py redis

exec celery -A app.celery_app.celery_app beat -l info
