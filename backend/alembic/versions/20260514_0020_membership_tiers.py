"""Add user_memberships table and user_category column to users

Revision ID: 20260514_0020
Revises: 20260514_0019
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "20260514_0020"
down_revision = "20260514_0019"
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # 1. New column on users — membership / pricing category
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS user_category VARCHAR NOT NULL DEFAULT 'general_public'
    """)

    # ------------------------------------------------------------------
    # 2. New user_memberships table
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            category VARCHAR NOT NULL DEFAULT 'general_public',
            is_verified BOOLEAN NOT NULL DEFAULT false,
            venture_free_hours_remaining INTEGER NOT NULL DEFAULT 0,
            monthly_free_hours_reset_date TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_user_memberships_user_id ON user_memberships (user_id)
    """)


def downgrade():
    op.drop_index("ix_user_memberships_user_id", table_name="user_memberships")
    op.drop_table("user_memberships")
    op.drop_column("users", "user_category")
