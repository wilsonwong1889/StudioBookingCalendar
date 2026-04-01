import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.tasks import dispatch_due_reminders_task


def main() -> None:
    for hours_before in (24, 1):
        result = dispatch_due_reminders_task.delay(hours_before)
        output = result.get() if hasattr(result, "get") else result
        print(f"reminder_{hours_before}h: {output}")


if __name__ == "__main__":
    main()
