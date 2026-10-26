"""add Reserved status to bookings

Reservation-only mode confirms a room booking the moment it is made, with no
payment step. That needs a status meaning "confirmed, holds the slot, no money
involved" — 'Paid' would be a lie in the admin tables and the reports.

'Reserved' joins the room/time exclusion guard so a reservation blocks the slot
exactly like a paid booking does; without that two people could reserve the same
hour.

Revision ID: 20261026_0045
Revises: 20260709_0044
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op


revision: str = "20261026_0045"
down_revision: Union[str, None] = "20260709_0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_STATUSES = "'PendingPayment','Reserved','Paid','DepositPaid','Completed','Cancelled','Refunded'"
_OLD_STATUSES = "'PendingPayment','Paid','DepositPaid','Completed','Cancelled','Refunded'"
_NEW_EXCL = "'PendingPayment','Reserved','Paid','DepositPaid','Completed'"
_OLD_EXCL = "'PendingPayment','Paid','DepositPaid','Completed'"


def _apply(status_values: str, excl_values: str) -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.drop_constraint("booking_status_check", "bookings", type_="check")
    op.create_check_constraint(
        "booking_status_check", "bookings", f"status IN ({status_values})"
    )
    op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_room_time_excl")
    op.execute(
        f"""
        ALTER TABLE bookings
        ADD CONSTRAINT booking_room_time_excl
        EXCLUDE USING gist (
          room_id WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status IN ({excl_values}))
        """
    )


def upgrade() -> None:
    _apply(_NEW_STATUSES, _NEW_EXCL)


def downgrade() -> None:
    # Reservations were never paid, so PendingPayment is the honest landing
    # place for them under the old constraint — not Paid.
    op.execute("UPDATE bookings SET status = 'PendingPayment' WHERE status = 'Reserved'")
    _apply(_OLD_STATUSES, _OLD_EXCL)
