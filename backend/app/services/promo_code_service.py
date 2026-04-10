from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.promo_code import PromoCode
from app.schemas.promo_code import PromoCodeCreate, PromoCodeUpdate, normalize_promo_code


class PromoCodeError(ValueError):
    pass


def get_promo_code_by_code(db: Session, code: str) -> PromoCode | None:
    normalized_code = normalize_promo_code(code)
    return db.query(PromoCode).filter(PromoCode.code == normalized_code).first()


def list_promo_codes(db: Session) -> list[dict]:
    promo_codes = db.query(PromoCode).order_by(PromoCode.created_at.desc(), PromoCode.code.asc()).all()
    return [serialize_promo_code(db, promo_code) for promo_code in promo_codes]


def create_promo_code(db: Session, payload: PromoCodeCreate) -> dict:
    _validate_discount_shape(payload.percent_off, payload.amount_off_cents)
    existing = db.query(PromoCode).filter(PromoCode.code == payload.code).first()
    if existing:
        raise PromoCodeError("Promo code already exists")

    promo_code = PromoCode(**payload.model_dump())
    db.add(promo_code)
    db.flush()
    return serialize_promo_code(db, promo_code)


def update_promo_code(db: Session, promo_code_id: str, payload: PromoCodeUpdate) -> dict:
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise PromoCodeError("Promo code not found")

    update_data = payload.model_dump(exclude_unset=True)
    percent_off = update_data.get("percent_off", promo_code.percent_off)
    amount_off_cents = update_data.get("amount_off_cents", promo_code.amount_off_cents)
    if ("percent_off" in update_data) or ("amount_off_cents" in update_data):
        _validate_discount_shape(percent_off, amount_off_cents)

    if "code" in update_data and update_data["code"] != promo_code.code:
        existing = db.query(PromoCode).filter(PromoCode.code == update_data["code"]).first()
        if existing:
            raise PromoCodeError("Promo code already exists")

    expires_at = update_data.get("expires_at", promo_code.expires_at)
    starts_at = update_data.get("starts_at", promo_code.starts_at)
    if expires_at and starts_at and expires_at <= starts_at:
        raise PromoCodeError("Promo code expiry must be after the start time")

    for field, value in update_data.items():
        setattr(promo_code, field, value)

    db.flush()
    return serialize_promo_code(db, promo_code)


def serialize_promo_code(db: Session, promo_code: PromoCode) -> dict:
    active_redemptions = (
        db.query(Booking)
        .filter(Booking.promo_code == promo_code.code)
        .filter(Booking.status.in_(("PendingPayment", "Paid", "Completed", "Refunded")))
        .count()
    )
    return {
        "id": promo_code.id,
        "code": promo_code.code,
        "description": promo_code.description,
        "percent_off": promo_code.percent_off,
        "amount_off_cents": promo_code.amount_off_cents,
        "active": promo_code.active,
        "max_redemptions": promo_code.max_redemptions,
        "starts_at": promo_code.starts_at,
        "expires_at": promo_code.expires_at,
        "active_redemptions": active_redemptions,
        "created_at": promo_code.created_at,
        "updated_at": promo_code.updated_at,
    }


def calculate_discount_for_amount(db: Session, code: str, amount_cents: int) -> dict:
    if amount_cents < 0:
        raise PromoCodeError("Amount must be zero or higher")

    promo_code = get_promo_code_by_code(db, code)
    if not promo_code:
        raise PromoCodeError("Promo code not found")
    _ensure_promo_code_is_usable(db, promo_code)

    discount_cents = _calculate_discount_cents(promo_code, amount_cents)
    return {
        "promo_code": promo_code,
        "discount_cents": discount_cents,
        "final_amount_cents": max(amount_cents - discount_cents, 0),
    }


def apply_promo_code_to_amount(db: Session, code: str | None, amount_cents: int) -> dict:
    if not code:
        return {"promo_code": None, "discount_cents": 0, "final_amount_cents": amount_cents}

    result = calculate_discount_for_amount(db, code, amount_cents)
    return result


def _ensure_promo_code_is_usable(db: Session, promo_code: PromoCode) -> None:
    now = datetime.now(timezone.utc)
    if not promo_code.active:
        raise PromoCodeError("Promo code is inactive")
    if promo_code.starts_at and promo_code.starts_at > now:
        raise PromoCodeError("Promo code is not active yet")
    if promo_code.expires_at and promo_code.expires_at < now:
        raise PromoCodeError("Promo code has expired")
    if promo_code.max_redemptions is not None:
        active_redemptions = (
            db.query(Booking)
            .filter(Booking.promo_code == promo_code.code)
            .filter(Booking.status.in_(("PendingPayment", "Paid", "Completed", "Refunded")))
            .count()
        )
        if active_redemptions >= promo_code.max_redemptions:
            raise PromoCodeError("Promo code has reached its usage limit")


def _calculate_discount_cents(promo_code: PromoCode, amount_cents: int) -> int:
    if amount_cents <= 0:
        return 0
    if promo_code.percent_off is not None:
        return min(amount_cents, round(amount_cents * (promo_code.percent_off / 100)))
    if promo_code.amount_off_cents is not None:
        return min(amount_cents, promo_code.amount_off_cents)
    return 0


def _validate_discount_shape(percent_off: int | None, amount_off_cents: int | None) -> None:
    if bool(percent_off) == bool(amount_off_cents):
        raise PromoCodeError("Choose exactly one discount type: percent or fixed amount")
