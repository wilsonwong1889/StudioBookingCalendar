"""initial schema

Revision ID: 20260313_0001
Revises:
Create Date: 2026-03-13 16:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260313_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("billing_address", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
        sa.Column("opt_in_email", sa.Boolean(), nullable=True),
        sa.Column("opt_in_sms", sa.Boolean(), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("photos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("booking_code", sa.String(), nullable=False),
        sa.Column("payment_intent_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint(
            "status IN ('PendingPayment','Paid','Completed','Cancelled','Refunded')",
            name="booking_status_check",
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_code"),
    )

    op.create_table(
        "booking_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "slot_start", name="uq_room_slot"),
    )


def downgrade() -> None:
    op.drop_table("booking_slots")
    op.drop_table("bookings")
    op.drop_table("rooms")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
