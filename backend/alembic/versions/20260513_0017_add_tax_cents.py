"""add tax_cents to bookings

Revision ID: 20260513_0017
Revises: 20260512_0016
Create Date: 2026-05-13 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260513_0017"
down_revision: Union[str, None] = "20260512_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("tax_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("bookings", "tax_cents", server_default=None)


def downgrade() -> None:
    op.drop_column("bookings", "tax_cents")
