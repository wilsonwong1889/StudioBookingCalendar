"""add reviews, avatar support, and booking overlap guard

Revision ID: 20260417_0014
Revises: 20260409_0013
Create Date: 2026-04-17 11:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260417_0014"
down_revision = "20260409_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))

    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="review_rating_range_check"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id"),
    )

    op.execute(
        """
        ALTER TABLE bookings
        ADD CONSTRAINT booking_room_time_excl
        EXCLUDE USING gist (
          room_id WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status IN ('PendingPayment', 'Paid', 'Completed'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_room_time_excl")
    op.drop_table("reviews")
    op.drop_column("users", "avatar_url")
