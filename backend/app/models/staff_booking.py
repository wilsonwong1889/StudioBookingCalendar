import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint, UUID

from app.config import settings
from app.database import Base


class StaffBooking(Base):
    __tablename__ = "staff_bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    staff_profile_id = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False)
    service_type = Column(String)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    original_price_cents = Column(Integer)
    discount_cents = Column(Integer, nullable=False, default=0)
    promo_code = Column(String)
    price_cents = Column(Integer, nullable=False)
    currency = Column(String, default=settings.DEFAULT_CURRENCY)
    status = Column(String, nullable=False, default="PendingPayment")
    booking_code = Column(String, nullable=False, unique=True)
    user_email_snapshot = Column(String)
    user_full_name_snapshot = Column(String)
    user_phone_snapshot = Column(String)
    payment_intent_id = Column(String)
    payment_client_secret = Column(String)
    confirmed_at = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))
    cancellation_reason = Column(String)
    note = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        CheckConstraint(
            "status IN ('PendingPayment','Paid','Completed','Cancelled','Refunded')",
            name="staff_booking_status_check",
        ),
        ExcludeConstraint(
            ("staff_profile_id", "="),
            (func.tstzrange(start_time, end_time, "[)"), "&&"),
            where=text("status IN ('PendingPayment','Paid','Completed')"),
            using="gist",
            name="staff_booking_time_excl",
        ),
    )

    @property
    def payment_expires_at(self):
        if self.status != "PendingPayment" or not self.created_at:
            return None
        created_at = self.created_at
        if created_at.tzinfo is None or created_at.utcoffset() is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return created_at + timedelta(minutes=settings.PENDING_BOOKING_EXPIRY_MINUTES)

    @property
    def payment_seconds_remaining(self):
        expires_at = self.payment_expires_at
        if not expires_at:
            return None
        remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
        return max(0, remaining)
