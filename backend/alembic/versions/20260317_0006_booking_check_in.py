"""add booking check-in timestamp

Revision ID: 20260317_0006
Revises: 20260317_0005
Create Date: 2026-03-17 11:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260317_0006"
down_revision = "20260317_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "checked_in_at")
