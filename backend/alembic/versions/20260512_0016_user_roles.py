"""add user roles

Revision ID: 20260512_0016
Revises: 20260427_0015
Create Date: 2026-05-12 23:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260512_0016"
down_revision: Union[str, None] = "20260427_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(), nullable=False, server_default="Customer"),
    )
    op.execute("UPDATE users SET role = 'Admin' WHERE is_admin = true")
    op.execute(
        """
        UPDATE users
        SET role = 'AdminManager', is_admin = true, full_name = COALESCE(NULLIF(full_name, ''), 'BIPOC Foundation Admin')
        WHERE email = 'adminstudiobipoc@gmail.com'
        """
    )
    op.execute(
        """
        UPDATE users
        SET role = 'AdminManager', is_admin = true
        WHERE id = (
            SELECT id
            FROM users
            WHERE is_admin = true
            ORDER BY created_at ASC, email ASC
            LIMIT 1
        )
        AND NOT EXISTS (
            SELECT 1
            FROM users
            WHERE role = 'AdminManager'
        )
        """
    )
    op.create_check_constraint(
        "user_role_check",
        "users",
        "role IN ('Customer','Admin','AdminManager')",
    )
    op.alter_column("users", "role", server_default=None)


def downgrade() -> None:
    op.drop_constraint("user_role_check", "users", type_="check")
    op.drop_column("users", "role")
