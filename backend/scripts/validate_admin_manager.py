import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.database import SessionLocal
from app.models.user import User
from app.roles import USER_ROLE_ADMIN_MANAGER


def main() -> None:
    db = SessionLocal()
    try:
        admin_manager_count = (
            db.query(User)
            .filter(User.role == USER_ROLE_ADMIN_MANAGER, User.is_admin.is_(True))
            .count()
        )
    finally:
        db.close()

    if admin_manager_count <= 0:
        raise SystemExit(
            "No AdminManager account exists. Seed or promote one before starting the API."
        )

    print(f"AdminManager accounts ready: {admin_manager_count}")


if __name__ == "__main__":
    main()
