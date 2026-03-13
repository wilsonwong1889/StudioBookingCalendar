from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List
from datetime import datetime

class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    capacity: Optional[int] = None
    photos: Optional[List[str]] = []
    hourly_rate_cents: int = 5000

class RoomOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    capacity: Optional[int]
    photos: Optional[List[str]]
    hourly_rate_cents: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    photos: Optional[List[str]] = None
    hourly_rate_cents: Optional[int] = None
    active: Optional[bool] = None
