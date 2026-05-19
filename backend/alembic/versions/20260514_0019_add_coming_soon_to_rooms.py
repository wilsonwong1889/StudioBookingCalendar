"""add coming_soon to rooms

Revision ID: 20260514_0019
Revises: 20260513_0018
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "20260514_0019"
down_revision = "20260513_0018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rooms",
        sa.Column("coming_soon", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )


def downgrade():
    op.drop_column("rooms", "coming_soon")
