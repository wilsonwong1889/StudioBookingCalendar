"""staff profiles catalog

Revision ID: 20260331_0007
Revises: 25af06da36a5
Create Date: 2026-03-31 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260331_0007"
down_revision: Union[str, None] = "25af06da36a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("skills", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("talents", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("photo_url", sa.String(), nullable=True),
        sa.Column("add_on_price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("staff_profiles")
