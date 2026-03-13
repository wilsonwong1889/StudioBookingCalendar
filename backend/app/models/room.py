import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(String)
    capacity = Column(Integer)
    photos = Column(JSONB, default=list)
    hourly_rate_cents = Column(Integer, nullable=False, default=5000)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
