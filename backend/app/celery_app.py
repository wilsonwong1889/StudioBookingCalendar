from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.config import settings

try:  # pragma: no cover - exercised indirectly when Celery is installed
    from celery import Celery
    from celery.schedules import schedule
except ImportError:  # pragma: no cover - local fallback
    Celery = None
    schedule = None


class InlineResult:
    def __init__(self, value):
        self._value = value
        self.id = f"inline-{uuid4().hex}"
        self.inline = True

    def get(self, timeout=None):
        return self._value


def _inline_task(fn):
    def delay(*args, **kwargs):
        return InlineResult(fn(*args, **kwargs))

    fn.delay = delay
    return fn


def _schedule_value(seconds: int):
    if schedule is not None:
        return schedule(run_every=seconds)
    return seconds


beat_schedule_config = {
    **{
        f"dispatch-reminders-{hours_before}h": {
            "task": "app.tasks.dispatch_due_reminders",
            "schedule": _schedule_value(settings.REMINDER_DISPATCH_INTERVAL_MINUTES * 60),
            "args": (hours_before,),
        }
        for hours_before in settings.reminder_hours_before_list
    },
    "cleanup-expired-pending-bookings": {
        "task": "app.tasks.cleanup_expired_pending_bookings",
        "schedule": _schedule_value(settings.PENDING_BOOKING_CLEANUP_INTERVAL_MINUTES * 60),
        "args": (settings.PENDING_BOOKING_EXPIRY_MINUTES,),
    },
}


if Celery is not None:
    celery_app = Celery(
        "studio_booking",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
        beat_schedule=beat_schedule_config,
        imports=("app.tasks",),
    )
    celery_app.autodiscover_tasks(["app"])

    def task(*args, **kwargs):
        return celery_app.task(*args, **kwargs)

else:
    celery_app = SimpleNamespace(
        conf=SimpleNamespace(
            task_always_eager=True,
            beat_schedule=beat_schedule_config,
        )
    )

    def task(*args, **kwargs):
        def decorator(fn):
            return _inline_task(fn)

        return decorator
