"""user two factor auth

Revision ID: 20260401_0010
Revises: 20260401_0009
Create Date: 2026-04-01 23:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260401_0010"
down_revision: Union[str, None] = "20260401_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column("two_factor_method", sa.String(), nullable=False, server_default="email"),
    )
    op.add_column("users", sa.Column("two_factor_code_hash", sa.String(), nullable=True))
    op.add_column("users", sa.Column("two_factor_code_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "two_factor_code_expires_at")
    op.drop_column("users", "two_factor_code_hash")
    op.drop_column("users", "two_factor_method")
    op.drop_column("users", "two_factor_enabled")
