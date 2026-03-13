import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, func, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PendingPayment','Paid','Completed','Cancelled','Refunded')",
            name="booking_status_check"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    price_cents = Column(Integer, nullable=False)
    currency = Column(String, default="USD")
    status = Column(String, nullable=False, default="PendingPayment")
    booking_code = Column(String, nullable=False, unique=True)
    payment_intent_id = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BookingSlot(Base):
    __tablename__ = "booking_slots"
    __table_args__ = (
        UniqueConstraint("room_id", "slot_start", name="uq_room_slot"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    room_id = Column(UUID(as_uuid=True), nullable=False)
    slot_start = Column(DateTime(timezone=True), nullable=False)
