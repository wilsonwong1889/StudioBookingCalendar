"""add status to rooms

Revision ID: 20260519_0022
Revises: 20260514_0021
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "20260519_0022"
down_revision = "20260514_0021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rooms",
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=True,
            server_default=sa.text("'available'"),
        ),
    )


def downgrade():
    op.drop_column("rooms", "status")
