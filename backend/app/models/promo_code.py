import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class PromoCode(Base):
    __tablename__ = "promo_codes"
    __table_args__ = (
        CheckConstraint(
            "(percent_off IS NOT NULL AND amount_off_cents IS NULL) OR "
            "(percent_off IS NULL AND amount_off_cents IS NOT NULL)",
            name="promo_code_discount_shape_check",
        ),
        CheckConstraint(
            "percent_off IS NULL OR (percent_off >= 1 AND percent_off <= 100)",
            name="promo_code_percent_off_check",
        ),
        CheckConstraint(
            "amount_off_cents IS NULL OR amount_off_cents >= 1",
            name="promo_code_amount_off_cents_check",
        ),
        CheckConstraint(
            "max_redemptions IS NULL OR max_redemptions >= 1",
            name="promo_code_max_redemptions_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, nullable=False, unique=True, index=True)
    description = Column(String)
    percent_off = Column(Integer)
    amount_off_cents = Column(Integer)
    active = Column(Boolean, nullable=False, default=True)
    max_redemptions = Column(Integer)
    starts_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
