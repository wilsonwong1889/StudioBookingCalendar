from collections import defaultdict, deque
from threading import Lock
from time import time

from fastapi import HTTPException, Request, status

from app.config import settings


_requests: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def rate_limit_dependency(namespace: str, max_requests: int):
    def dependency(request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        key = f"{namespace}:{client_host}"
        now = time()
        window_start = now - settings.RATE_LIMIT_WINDOW_SECONDS

        with _lock:
            entries = _requests[key]
            while entries and entries[0] < window_start:
                entries.popleft()
            if len(entries) >= max_requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                )
            entries.append(now)

    return dependency
