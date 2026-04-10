"""add promo codes

Revision ID: 20260409_0013
Revises: 20260408_0012
Create Date: 2026-04-09 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260409_0013"
down_revision = "20260408_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "promo_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("percent_off", sa.Integer(), nullable=True),
        sa.Column("amount_off_cents", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint(
            "(percent_off IS NOT NULL AND amount_off_cents IS NULL) OR "
            "(percent_off IS NULL AND amount_off_cents IS NOT NULL)",
            name="promo_code_discount_shape_check",
        ),
        sa.CheckConstraint(
            "percent_off IS NULL OR (percent_off >= 1 AND percent_off <= 100)",
            name="promo_code_percent_off_check",
        ),
        sa.CheckConstraint(
            "amount_off_cents IS NULL OR amount_off_cents >= 1",
            name="promo_code_amount_off_cents_check",
        ),
        sa.CheckConstraint(
            "max_redemptions IS NULL OR max_redemptions >= 1",
            name="promo_code_max_redemptions_check",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_promo_codes_code"), "promo_codes", ["code"], unique=True)
    op.add_column("bookings", sa.Column("original_price_cents", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("bookings", sa.Column("promo_code", sa.String(), nullable=True))
    op.execute("UPDATE bookings SET original_price_cents = price_cents WHERE original_price_cents IS NULL")
    op.alter_column("bookings", "discount_cents", server_default=None)


def downgrade() -> None:
    op.drop_column("bookings", "promo_code")
    op.drop_column("bookings", "discount_cents")
    op.drop_column("bookings", "original_price_cents")
    op.drop_index(op.f("ix_promo_codes_code"), table_name="promo_codes")
    op.drop_table("promo_codes")
