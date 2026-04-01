"""default currency cad

Revision ID: 20260316_0003
Revises: 20260313_0002
Create Date: 2026-03-16 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260316_0003"
down_revision: Union[str, None] = "20260313_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE bookings SET currency = 'CAD' WHERE currency IS NULL OR currency = 'USD'")
    op.execute("UPDATE refunds SET currency = 'CAD' WHERE currency IS NULL OR currency = 'USD'")
    op.alter_column("bookings", "currency", server_default=sa.text("'CAD'"))
    op.alter_column("refunds", "currency", server_default=sa.text("'CAD'"))


def downgrade() -> None:
    op.execute("UPDATE refunds SET currency = 'USD' WHERE currency = 'CAD'")
    op.execute("UPDATE bookings SET currency = 'USD' WHERE currency = 'CAD'")
    op.alter_column("bookings", "currency", server_default=sa.text("'USD'"))
    op.alter_column("refunds", "currency", server_default=sa.text("'USD'"))
