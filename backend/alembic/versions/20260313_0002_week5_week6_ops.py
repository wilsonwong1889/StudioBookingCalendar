"""week 5 and 6 ops schema

Revision ID: 20260313_0002
Revises: 20260313_0001
Create Date: 2026-03-13 17:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260313_0002"
down_revision: Union[str, None] = "20260313_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("cancellation_reason", sa.String(), nullable=True))

    op.create_table(
        "refunds",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("stripe_refund_id", sa.String(), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("status IN ('Requested','Processed','Rejected')", name="refund_status_check"),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "notification_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("notification_logs")
    op.drop_table("refunds")
    op.drop_column("bookings", "cancellation_reason")
    op.drop_column("bookings", "cancelled_at")
    op.drop_column("bookings", "confirmed_at")
