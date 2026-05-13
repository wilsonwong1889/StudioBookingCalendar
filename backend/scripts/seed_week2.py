import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.database import SessionLocal
from app.services.seed_service import ensure_admin_user, ensure_promo_codes, ensure_rooms, ensure_staff_profiles


PLACEHOLDER_PASSWORD_MARKERS = ("change-me", "change_me", "placeholder", "example")


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _seed_admin_password() -> str:
    password = os.environ.get("SEED_ADMIN_PASSWORD", "").strip()
    if not password:
        raise SystemExit("SEED_ADMIN_PASSWORD is required before admin seed data can run.")
    lowered = password.lower()
    if any(marker in lowered for marker in PLACEHOLDER_PASSWORD_MARKERS):
        raise SystemExit("SEED_ADMIN_PASSWORD must be changed from the placeholder value before seeding.")
    if os.environ.get("APP_ENV", "development").strip().lower() == "production" and len(password) < 12:
        raise SystemExit("SEED_ADMIN_PASSWORD must be at least 12 characters in production.")
    return password


def main() -> None:
    db = SessionLocal()
    try:
        admin = ensure_admin_user(
            db,
            email=os.environ.get("SEED_ADMIN_EMAIL", "adminstudiobipoc@gmail.com"),
            password=_seed_admin_password(),
            full_name=os.environ.get("SEED_ADMIN_FULL_NAME", "BIPOC Foundation Admin"),
            phone=os.environ.get("SEED_ADMIN_PHONE", ""),
            role=os.environ.get("SEED_ADMIN_ROLE", "AdminManager"),
            rotate_password=_bool_env("SEED_ADMIN_ROTATE_PASSWORD", default=False),
        )
        staff_profiles = ensure_staff_profiles(db)
        rooms = ensure_rooms(db)
        promo_codes = ensure_promo_codes(db)
        admin_email = admin.email
        staff_profile_count = len(staff_profiles)
        room_count = len(rooms)
        promo_code_count = len(promo_codes)
    finally:
        db.close()

    print(f"Admin ready: {admin_email}")
    print(f"Staff profiles created this run: {staff_profile_count}")
    print(f"Rooms created this run: {room_count}")
    print(f"Promo codes created this run: {promo_code_count}")


if __name__ == "__main__":
    main()
