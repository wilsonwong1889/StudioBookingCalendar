"""add user about fields

Revision ID: 20260513_0018
Revises: 20260513_0017
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa

revision = "20260513_0018"
down_revision = "20260513_0017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("emergency_contact", sa.String(), nullable=True))
    op.add_column("users", sa.Column("visible_minority", sa.String(), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(), nullable=True))


def downgrade():
    op.drop_column("users", "city")
    op.drop_column("users", "visible_minority")
    op.drop_column("users", "emergency_contact")
