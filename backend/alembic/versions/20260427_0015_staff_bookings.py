"""add staff bookings and bookable staff fields

Revision ID: 20260427_0015
Revises: 20260417_0014
Create Date: 2026-04-27 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260427_0015"
down_revision = "20260417_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.add_column("staff_profiles", sa.Column("booking_rate_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "staff_profiles",
        sa.Column("service_types", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default="[]"),
    )
    op.add_column("staff_profiles", sa.Column("booking_enabled", sa.Boolean(), nullable=False, server_default="true"))

    op.create_table(
        "staff_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("staff_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_type", sa.String(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("original_price_cents", sa.Integer(), nullable=True),
        sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("promo_code", sa.String(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="PendingPayment"),
        sa.Column("booking_code", sa.String(), nullable=False),
        sa.Column("user_email_snapshot", sa.String(), nullable=True),
        sa.Column("user_full_name_snapshot", sa.String(), nullable=True),
        sa.Column("user_phone_snapshot", sa.String(), nullable=True),
        sa.Column("payment_intent_id", sa.String(), nullable=True),
        sa.Column("payment_client_secret", sa.String(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.String(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint(
            "status IN ('PendingPayment','Paid','Completed','Cancelled','Refunded')",
            name="staff_booking_status_check",
        ),
        sa.ForeignKeyConstraint(["staff_profile_id"], ["staff_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_code"),
    )

    op.execute(
        """
        ALTER TABLE staff_bookings
        ADD CONSTRAINT staff_booking_time_excl
        EXCLUDE USING gist (
          staff_profile_id WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status IN ('PendingPayment', 'Paid', 'Completed'))
        """
    )

    op.alter_column("staff_profiles", "booking_rate_cents", server_default=None)
    op.alter_column("staff_profiles", "service_types", server_default=None)
    op.alter_column("staff_profiles", "booking_enabled", server_default=None)


def downgrade() -> None:
    op.execute("ALTER TABLE staff_bookings DROP CONSTRAINT IF EXISTS staff_booking_time_excl")
    op.drop_table("staff_bookings")
    op.drop_column("staff_profiles", "booking_enabled")
    op.drop_column("staff_profiles", "service_types")
    op.drop_column("staff_profiles", "booking_rate_cents")
