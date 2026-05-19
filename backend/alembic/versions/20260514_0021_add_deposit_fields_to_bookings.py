"""add deposit fields to bookings

Revision ID: 20260514_0021
Revises: 20260514_0020
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "20260514_0021"
down_revision = "20260514_0020"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_with_engineer BOOLEAN NOT NULL DEFAULT false")


def downgrade():
    op.drop_column("bookings", "deposit_with_engineer")
    op.drop_column("bookings", "deposit_paid")
    op.drop_column("bookings", "deposit_amount_cents")
