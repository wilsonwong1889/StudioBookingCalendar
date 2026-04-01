from __future__ import annotations

import time
from dataclasses import dataclass
from threading import Lock
from typing import Optional
from uuid import uuid4

from app.config import settings

try:
    import redis
except ImportError:  # pragma: no cover - optional local dependency
    redis = None


_memory_lock = Lock()
_memory_holds: dict[str, tuple[float, str]] = {}


@dataclass
class ReservationHold:
    token: str
    expires_at: int
    slot_keys: list[str]


def _redis_client():
    if redis is None:
        return None
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _cleanup_expired_memory_holds() -> None:
    now = time.time()
    expired_keys = [key for key, value in _memory_holds.items() if value[0] <= now]
    for key in expired_keys:
        _memory_holds.pop(key, None)


def create_hold(slot_keys: list[str], ttl_seconds: Optional[int] = None) -> ReservationHold:
    ttl_seconds = ttl_seconds or settings.RESERVATION_HOLD_MINUTES * 60
    expires_at = int(time.time()) + ttl_seconds
    token = f"hold_{uuid4().hex}"
    redis_client = _redis_client()

    if redis_client is not None:
        pipeline = redis_client.pipeline()
        for slot_key in slot_keys:
            pipeline.set(slot_key, token, nx=True, ex=ttl_seconds)
        results = pipeline.execute()
        if not all(results):
            release_hold(slot_keys, token)
            raise ValueError("One or more slots are already on hold")
        return ReservationHold(token=token, expires_at=expires_at, slot_keys=slot_keys)

    with _memory_lock:
        _cleanup_expired_memory_holds()
        for slot_key in slot_keys:
            if slot_key in _memory_holds:
                raise ValueError("One or more slots are already on hold")
        for slot_key in slot_keys:
            _memory_holds[slot_key] = (time.time() + ttl_seconds, token)

    return ReservationHold(token=token, expires_at=expires_at, slot_keys=slot_keys)


def validate_hold(slot_keys: list[str], token: str) -> bool:
    redis_client = _redis_client()
    if redis_client is not None:
        return all(redis_client.get(slot_key) == token for slot_key in slot_keys)

    with _memory_lock:
        _cleanup_expired_memory_holds()
        return all(_memory_holds.get(slot_key, (None, None))[1] == token for slot_key in slot_keys)


def release_hold(slot_keys: list[str], token: str) -> None:
    redis_client = _redis_client()
    if redis_client is not None:
        pipeline = redis_client.pipeline()
        for slot_key in slot_keys:
            if redis_client.get(slot_key) == token:
                pipeline.delete(slot_key)
        pipeline.execute()
        return

    with _memory_lock:
        _cleanup_expired_memory_holds()
        for slot_key in slot_keys:
            if _memory_holds.get(slot_key, (None, None))[1] == token:
                _memory_holds.pop(slot_key, None)
