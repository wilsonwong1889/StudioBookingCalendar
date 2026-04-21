from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


class ReviewOut(BaseModel):
    id: UUID
    booking_id: UUID
    room_id: UUID
    user_id: Optional[UUID] = None
    rating: int
    comment: Optional[str] = None
    reviewer_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RoomReviewSummaryOut(BaseModel):
    room_id: UUID
    review_count: int
    average_rating: Optional[float] = None


class RoomReviewFeedOut(BaseModel):
    summary: RoomReviewSummaryOut
    reviews: List[ReviewOut]
