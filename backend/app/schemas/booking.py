from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import Optional
from datetime import datetime

class BookingCreate(BaseModel):
    room_id: UUID
    start_time: datetime
    duration_minutes: int
    payment_method_id: Optional[str] = None

    @field_validator("start_time")
    @classmethod
    def validate_slot_alignment(cls, v):
        if v.minute not in (0, 30) or v.second != 0:
            raise ValueError("Bookings must start on :00 or :30")
        return v

    @field_validator("duration_minutes")
    @classmethod
    def validate_duration(cls, v):
        if v < 60:
            raise ValueError("Minimum booking duration is 60 minutes")
        if v % 30 != 0:
            raise ValueError("Duration must be in 30-minute increments")
        return v

class BookingOut(BaseModel):
    id: UUID
    room_id: UUID
    user_id: Optional[UUID]
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    price_cents: int
    currency: str
    status: str
    booking_code: str
    created_at: datetime

    model_config = {"from_attributes": True}
