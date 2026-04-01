"""account admin management

Revision ID: 20260401_0008
Revises: 20260331_0007
Create Date: 2026-04-01 14:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260401_0008"
down_revision: Union[str, None] = "20260331_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("user_email_snapshot", sa.String(), nullable=True))
    op.add_column("bookings", sa.Column("user_full_name_snapshot", sa.String(), nullable=True))
    op.add_column("bookings", sa.Column("user_phone_snapshot", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE bookings AS b
        SET
            user_email_snapshot = u.email,
            user_full_name_snapshot = u.full_name,
            user_phone_snapshot = u.phone
        FROM users AS u
        WHERE b.user_id = u.id
        """
    )


def downgrade() -> None:
    op.drop_column("bookings", "user_phone_snapshot")
    op.drop_column("bookings", "user_full_name_snapshot")
    op.drop_column("bookings", "user_email_snapshot")
