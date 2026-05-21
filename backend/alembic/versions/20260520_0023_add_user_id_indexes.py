"""add user_id indexes for deletion performance

Revision ID: 20260520_0023
Revises: 20260519_0022
Create Date: 2026-05-20
"""
from alembic import op

revision = "20260520_0023"
down_revision = "20260519_0022"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_bookings_user_id", "bookings", ["user_id"])
    op.create_index("ix_notification_logs_user_id", "notification_logs", ["user_id"])
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"])
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_staff_bookings_user_id", "staff_bookings", ["user_id"])


def downgrade():
    op.drop_index("ix_bookings_user_id", table_name="bookings")
    op.drop_index("ix_notification_logs_user_id", table_name="notification_logs")
    op.drop_index("ix_reviews_user_id", table_name="reviews")
    op.drop_index("ix_audit_logs_actor_id", table_name="audit_logs")
    op.drop_index("ix_staff_bookings_user_id", table_name="staff_bookings")
