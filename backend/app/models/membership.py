import uuid
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class UserMembership(Base):
    __tablename__ = "user_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Recognised categories:
    # artist_member | fellowship_artist | artist_in_residence | service_engineer
    # bipoc_community_member | venture_member | organizational_member | general_public
    category = Column(String, nullable=False, default="general_public")
    is_verified = Column(Boolean, default=False)  # used for organizational_member verification
    venture_free_hours_remaining = Column(Integer, default=0)
    monthly_free_hours_reset_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
