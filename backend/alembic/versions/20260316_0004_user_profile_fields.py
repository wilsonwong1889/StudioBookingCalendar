"""add user profile fields

Revision ID: 20260316_0004
Revises: 20260316_0003
Create Date: 2026-03-16 18:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260316_0004"
down_revision: Union[str, None] = "20260316_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "saved_payment_method",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "saved_payment_method")
    op.drop_column("users", "birthday")
