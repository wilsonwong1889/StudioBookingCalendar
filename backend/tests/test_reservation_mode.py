"""Backend tests — reservation-only booking (BOOKING_MODE=reserve).

The studio takes no money online. A room booking is confirmed the moment it is
made, and the only thing standing between the calendar and a no-show is that
the booking is attached to an account somebody signed into.

These tests pin the three properties that make that safe:

  1. A reservation holds its slot exactly like a paid booking does.
  2. A reservation never expires — the unpaid-booking sweeper must not touch it.
  3. A reservation never offers a pay button, and guests cannot make one.

They also guard the reverse: with BOOKING_MODE left at its default the paid
flow is untouched, so switching back is a config change and nothing more.
"""
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.base import BaseAppTest


def reserve_mode():
    """Run the block with the studio in reservation-only mode.

    Patches the live settings object rather than the environment because
    is_reservation_only() reads settings on every call.
    """
    from app.config import settings

    return patch.object(settings, "BOOKING_MODE", "reserve")


class ReservationModeTest(BaseAppTest):
    # ---------------------------------------------------------------- helpers

    def _create_room(self, name: str) -> str:
        from app.models.room import Room

        with self.SessionLocal() as db:
            room = Room(
                name=name,
                description="Reservation mode tests",
                capacity=4,
                photos=[],
                hourly_rate_cents=10000,
                max_booking_duration_minutes=480,
            )
            db.add(room)
            db.commit()
            db.refresh(room)
            return str(room.id)

    def _signup(self, email: str) -> dict:
        signup = self.client.post(
            "/api/auth/signup",
            json={
                "email": email,
                "password": "Password123!",
                "full_name": email.split("@")[0],
                "phone": "5551111111",
            },
        )
        self.assertEqual(signup.status_code, 201, signup.text)
        login = self.client.post(
            "/api/auth/login",
            data={"username": email, "password": "Password123!"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    def _next_open_slot(self, hour_offset: int = 0):
        """An upcoming open business day, at a bookable hour."""
        from app.services.booking_service.core import (
            BOOKING_OPEN_WEEKDAYS,
            get_booking_window_hours,
            get_business_timezone,
        )

        tz = get_business_timezone()
        open_hour, _close_hour = get_booking_window_hours()
        today = datetime.now(tz).date()
        offset = 1
        while offset < 60:
            candidate = today + timedelta(days=offset)
            if candidate.weekday() in BOOKING_OPEN_WEEKDAYS:
                return datetime(
                    candidate.year,
                    candidate.month,
                    candidate.day,
                    open_hour + hour_offset,
                    tzinfo=tz,
                )
            offset += 1
        self.fail("no open business day found in the next 60 days")

    def _book(self, headers: dict, room_id: str, start, duration: int = 60):
        return self.client.post(
            "/api/bookings",
            headers=headers,
            json={
                "room_id": room_id,
                "start_time": start.isoformat(),
                "duration_minutes": duration,
            },
        )

    # ------------------------------------------------------------------ tests

    def test_01_a_reservation_is_confirmed_not_pending_payment(self) -> None:
        """The whole point: nobody is sent to a checkout that takes no money."""
        room_id = self._create_room("Reserve Confirm Room")
        headers = self._signup(f"reserve-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        with reserve_mode():
            resp = self._book(headers, room_id, start)

        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(
            resp.json()["status"],
            "Reserved",
            "a booking made in reservation mode must be confirmed outright",
        )

    def test_02_payment_mode_is_untouched_by_default(self) -> None:
        """Switching back must be a config change and nothing more."""
        room_id = self._create_room("Payment Default Room")
        headers = self._signup(f"paid-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        resp = self._book(headers, room_id, start)

        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(resp.json()["status"], "PendingPayment")

    def test_03_a_reservation_holds_its_slot(self) -> None:
        """Without this two people reserve the same hour and both turn up."""
        room_id = self._create_room("Reserve Hold Room")
        first = self._signup(f"first-{uuid.uuid4().hex[:8]}@example.com")
        second = self._signup(f"second-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        with reserve_mode():
            held = self._book(first, room_id, start)
            self.assertEqual(held.status_code, 201, held.text)

            clash = self._book(second, room_id, start)

        self.assertEqual(
            clash.status_code,
            409,
            "a reserved hour must refuse a second booking, as a paid one does",
        )

    def test_04_a_reserved_hour_disappears_from_availability(self) -> None:
        room_id = self._create_room("Reserve Availability Room")
        headers = self._signup(f"avail-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        before = self.client.get(
            f"/api/rooms/{room_id}/availability?date={start.date().isoformat()}"
        ).json()["available_start_times"]

        with reserve_mode():
            self.assertEqual(self._book(headers, room_id, start).status_code, 201)

        after = self.client.get(
            f"/api/rooms/{room_id}/availability?date={start.date().isoformat()}"
        ).json()["available_start_times"]

        self.assertEqual(
            len(after),
            len(before) - 1,
            "reserving an hour must remove exactly that hour from what visitors see",
        )

    def test_05_a_reservation_never_expires(self) -> None:
        """The sweeper releases unpaid bookings. A reservation was never going
        to be paid, so it must be invisible to that sweep however old it gets."""
        from app.models.booking import Booking
        from app.services.booking_service.core import is_pending_booking_expired

        room_id = self._create_room("Reserve Expiry Room")
        headers = self._signup(f"expiry-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        with reserve_mode():
            resp = self._book(headers, room_id, start)
        booking_id = resp.json()["id"]

        with self.SessionLocal() as db:
            booking = db.query(Booking).filter(Booking.id == uuid.UUID(booking_id)).one()
            # Backdate it far past any payment window.
            booking.created_at = datetime.now(timezone.utc) - timedelta(days=365)
            db.commit()
            db.refresh(booking)

            self.assertEqual(booking.status, "Reserved")
            self.assertFalse(
                is_pending_booking_expired(booking),
                "a year-old reservation must still be held, not swept away",
            )
            self.assertIsNone(
                booking.payment_expires_at,
                "a reservation has no payment deadline to show the customer",
            )

    def test_06_a_reservation_offers_no_pay_button(self) -> None:
        room_id = self._create_room("Reserve No Pay Room")
        headers = self._signup(f"nopay-{uuid.uuid4().hex[:8]}@example.com")
        start = self._next_open_slot()

        with reserve_mode():
            self._book(headers, room_id, start)
            feed = self.client.get("/api/bookings/feed", headers=headers)

        self.assertEqual(feed.status_code, 200, feed.text)
        items = feed.json()
        self.assertTrue(items, "the reservation should appear in the customer's feed")
        entry = items[0]
        self.assertFalse(entry["can_pay"], "there is nothing to pay")
        self.assertTrue(entry["can_cancel"], "a customer must still be able to cancel")

    def test_07_guests_cannot_reserve_without_an_account(self) -> None:
        """Account-required is the only no-show deterrent left once the deposit
        is gone, and the guest endpoint would hand out throwaway accounts."""
        room_id = self._create_room("Reserve Guest Room")
        start = self._next_open_slot()

        with reserve_mode():
            resp = self.client.post(
                "/api/bookings/guest",
                json={
                    "room_id": room_id,
                    "start_time": start.isoformat(),
                    "duration_minutes": 60,
                    "guest_name": "Walk In",
                    "guest_email": "walkin@example.com",
                    "guest_phone": "5551234567",
                },
            )

        self.assertEqual(resp.status_code, 401, resp.text)
        self.assertIn("sign in", resp.json()["detail"].lower())

    def test_08_guest_booking_still_works_in_payment_mode(self) -> None:
        """The guest path is disabled by reservation mode, not deleted."""
        room_id = self._create_room("Payment Guest Room")
        start = self._next_open_slot()

        resp = self.client.post(
            "/api/bookings/guest",
            json={
                "room_id": room_id,
                "start_time": start.isoformat(),
                "duration_minutes": 60,
                "guest_name": "Walk In",
                "guest_email": "walkin-paid@example.com",
                "guest_phone": "5551234567",
            },
        )

        self.assertNotEqual(
            resp.status_code,
            401,
            "payment mode must keep accepting guest bookings",
        )


if __name__ == "__main__":
    unittest.main()
