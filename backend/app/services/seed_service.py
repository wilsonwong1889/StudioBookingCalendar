from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.promo_code import PromoCode
from app.models.room import Room
from app.models.staff_profile import StaffProfile
from app.models.user import User
from app.roles import USER_ROLE_ADMIN_MANAGER, is_admin_role, normalize_user_role
from app.schemas.promo_code import normalize_promo_code


DEFAULT_ROOM_SEEDS: tuple[dict, ...] = ()

DEFAULT_STAFF_PROFILE_SEEDS: tuple[dict, ...] = ()

DEFAULT_PROMO_CODE_SEEDS: tuple[dict, ...] = (
    {
        "code": "SUMMER60",
        "description": "Limited time opening discount for public bookings",
        "percent_off": 60,
        "amount_off_cents": None,
        "active": True,
        "max_redemptions": None,
    },
)


def ensure_admin_user(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str = "BIPOC Foundation Admin",
    phone: str | None = None,
    role: str = USER_ROLE_ADMIN_MANAGER,
    rotate_password: bool = True,
) -> User:
    normalized_phone = phone.strip() if phone else None
    normalized_role = normalize_user_role(role, is_admin=True)
    admin = db.query(User).filter(User.email == email).first()
    if admin:
        if password and rotate_password:
            admin.password_hash = hash_password(password)
        admin.is_admin = is_admin_role(normalized_role)
        admin.role = normalized_role
        if full_name:
            admin.full_name = full_name
        if normalized_phone:
            admin.phone = normalized_phone
        db.commit()
        db.refresh(admin)
        return admin

    admin = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        phone=normalized_phone,
        role=normalized_role,
        is_admin=is_admin_role(normalized_role),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def ensure_rooms(db: Session, rooms: Sequence[dict] = DEFAULT_ROOM_SEEDS) -> list[Room]:
    created_rooms: list[Room] = []
    for room_payload in rooms:
        existing_room = db.query(Room).filter(Room.name == room_payload["name"]).first()
        if existing_room:
            updated = False
            for field in ("description", "capacity", "hourly_rate_cents"):
                if getattr(existing_room, field) in (None, ""):
                    setattr(existing_room, field, room_payload[field])
                    updated = True
            if not existing_room.photos:
                existing_room.photos = room_payload["photos"]
                updated = True
            if updated:
                db.add(existing_room)
            continue
        room = Room(**room_payload)
        db.add(room)
        created_rooms.append(room)

    if created_rooms:
        db.commit()
        for room in created_rooms:
            db.refresh(room)
    else:
        db.commit()

    return created_rooms


def ensure_staff_profiles(db: Session, profiles: Sequence[dict] = DEFAULT_STAFF_PROFILE_SEEDS) -> list[StaffProfile]:
    created_profiles: list[StaffProfile] = []
    existing_by_name = {profile.name.lower(): profile for profile in db.query(StaffProfile).all()}
    for payload in profiles:
        lookup_key = payload["name"].strip().lower()
        existing = existing_by_name.get(lookup_key)
        if existing:
            updated = False
            if not existing.description and payload.get("description"):
                existing.description = payload["description"]
                updated = True
            if not existing.skills and payload.get("skills"):
                existing.skills = payload["skills"]
                updated = True
            if not existing.talents and payload.get("talents"):
                existing.talents = payload["talents"]
                updated = True
            if not existing.photo_url and payload.get("photo_url"):
                existing.photo_url = payload["photo_url"]
                updated = True
            if not existing.add_on_price_cents and payload.get("add_on_price_cents"):
                existing.add_on_price_cents = payload["add_on_price_cents"]
                updated = True
            if updated:
                db.add(existing)
            continue

        profile = StaffProfile(**payload)
        db.add(profile)
        created_profiles.append(profile)

    db.commit()
    for profile in created_profiles:
        db.refresh(profile)
    return created_profiles


def ensure_promo_codes(db: Session, promo_codes: Sequence[dict] = DEFAULT_PROMO_CODE_SEEDS) -> list[PromoCode]:
    created_promo_codes: list[PromoCode] = []
    for payload in promo_codes:
        code = normalize_promo_code(payload["code"])
        existing = db.query(PromoCode).filter(PromoCode.code == code).first()
        if existing:
            updated = False
            for field in (
                "description",
                "percent_off",
                "amount_off_cents",
                "active",
                "max_redemptions",
                "starts_at",
                "expires_at",
            ):
                if field in payload and getattr(existing, field) != payload[field]:
                    setattr(existing, field, payload[field])
                    updated = True
            if updated:
                db.add(existing)
            continue

        promo_code = PromoCode(**{**payload, "code": code})
        db.add(promo_code)
        created_promo_codes.append(promo_code)

    db.commit()
    for promo_code in created_promo_codes:
        db.refresh(promo_code)
    return created_promo_codes
