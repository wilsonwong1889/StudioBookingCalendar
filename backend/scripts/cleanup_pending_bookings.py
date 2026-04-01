import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.config import settings
from app.tasks import cleanup_expired_pending_bookings_task


def main() -> None:
    result = cleanup_expired_pending_bookings_task.delay(settings.PENDING_BOOKING_EXPIRY_MINUTES)
    output = result.get() if hasattr(result, "get") else result
    print(output)


if __name__ == "__main__":
    main()
