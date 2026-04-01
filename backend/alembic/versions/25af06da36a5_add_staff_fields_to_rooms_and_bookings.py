"""add_staff_fields_to_rooms_and_bookings

Revision ID: 25af06da36a5
Revises: 20260317_0006
Create Date: 2026-03-31 14:43:47.031769

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25af06da36a5'
down_revision: Union[str, None] = '20260317_0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add staff_roles column to rooms table
    op.add_column('rooms', sa.Column('staff_roles', sa.JSON(), nullable=True))
    
    # Add staff_assignments column to bookings table
    op.add_column('bookings', sa.Column('staff_assignments', sa.JSON(), nullable=True))


def downgrade() -> None:
    # Remove staff_assignments column from bookings table
    op.drop_column('bookings', 'staff_assignments')
    
    # Remove staff_roles column from rooms table
    op.drop_column('rooms', 'staff_roles')
