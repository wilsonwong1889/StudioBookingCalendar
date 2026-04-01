"""room max booking duration

Revision ID: 20260401_0009
Revises: 20260401_0008
Create Date: 2026-04-01 20:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260401_0009"
down_revision: Union[str, None] = "20260401_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column("max_booking_duration_minutes", sa.Integer(), nullable=False, server_default="300"),
    )


def downgrade() -> None:
    op.drop_column("rooms", "max_booking_duration_minutes")
