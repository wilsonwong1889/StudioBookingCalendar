"""
Backend tests — promo codes and room CRUD.

Covers: promo code create/list/preview, room photo upload, room create/read/
update/delete/restore/permanent-delete, admin-only access enforcement.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from tests.base import BaseAppTest, _minimal_png_bytes


class RoomTest(BaseAppTest):

    def _make_admin(self) -> dict:
        resp = self.client.post(
            "/api/auth/signup",
            json={
                "email": "room-admin@example.com",
                "password": "Password123!",
                "full_name": "Room Admin",
                "phone": "5550001111",
            },
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        admin_id = resp.json()["id"]

        with self.SessionLocal() as db:
            user = db.query(self.User).filter(self.User.id == admin_id).first()
            user.is_admin = True
            db.commit()

        resp = self.client.post(
            "/api/auth/login",
            data={"username": "room-admin@example.com", "password": "Password123!"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def test_00_promo_codes(self) -> None:
        admin_headers = self._make_admin()

        resp = self.client.get("/api/rooms?include_inactive=true")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.post(
            "/api/admin/promo-codes",
            headers=admin_headers,
            json={
                "code": "FOUNDATION10",
                "description": "10% off first booking",
                "percent_off": 10,
                "active": True,
            },
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["code"], "FOUNDATION10")
        self.assertEqual(resp.json()["percent_off"], 10)

        resp = self.client.get("/api/admin/promo-codes", headers=admin_headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["code"], "FOUNDATION10")

        resp = self.client.post(
            "/api/public/promo-codes/preview",
            json={"code": "FOUNDATION10", "amount_cents": 5000},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["discount_cents"], 500)
        self.assertEqual(resp.json()["final_amount_cents"], 4500)

    def test_01_room_crud(self) -> None:
        admin_headers = self._make_admin()

        resp = self.client.post(
            "/api/admin/rooms/photo",
            headers=admin_headers,
            files={"photo": ("room.png", _minimal_png_bytes(), "image/png")},
        )
        self.assertEqual(resp.status_code, 200)
        room_photo_url = resp.json()["photo_url"]
        self.assertTrue(room_photo_url.startswith("/assets/media/rooms/"))

        resp = self.client.post(
            "/api/rooms",
            headers=admin_headers,
            json={
                "name": "Studio A",
                "description": "Main room",
                "capacity": 4,
                "photos": [room_photo_url],
                "hourly_rate_cents": 5000,
                "max_booking_duration_minutes": 180,
            },
        )
        self.assertEqual(resp.status_code, 201)
        room_id = resp.json()["id"]
        self.assertEqual(resp.json()["max_booking_duration_minutes"], 180)

        resp = self.client.get(f"/api/rooms/{room_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Studio A")
        self.assertEqual(resp.json()["max_booking_duration_minutes"], 180)

        resp = self.client.put(
            f"/api/admin/rooms/{room_id}",
            headers=admin_headers,
            json={
                "name": "Studio A Edited",
                "description": "Updated main room",
                "capacity": 6,
                "hourly_rate_cents": 6500,
                "max_booking_duration_minutes": 240,
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Studio A Edited")
        self.assertEqual(resp.json()["capacity"], 6)
        self.assertEqual(resp.json()["hourly_rate_cents"], 6500)
        self.assertEqual(resp.json()["max_booking_duration_minutes"], 240)

        resp = self.client.get("/api/rooms?include_inactive=true", headers=admin_headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

        resp = self.client.delete(f"/api/rooms/{room_id}", headers=admin_headers)
        self.assertEqual(resp.status_code, 204)

        resp = self.client.get(f"/api/rooms/{room_id}")
        self.assertEqual(resp.status_code, 404)

        resp = self.client.get(f"/api/rooms/{room_id}", headers=admin_headers)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["active"])

        resp = self.client.get("/api/rooms?include_inactive=true", headers=admin_headers)
        self.assertEqual(resp.status_code, 200)
        archived_room = next(room for room in resp.json() if room["id"] == room_id)
        self.assertFalse(archived_room["active"])

        resp = self.client.post(f"/api/rooms/{room_id}/restore", headers=admin_headers)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["active"])

        resp = self.client.get("/api/rooms")
        self.assertEqual(resp.status_code, 200)
        room_names = [room["name"] for room in resp.json()]
        self.assertIn("Studio A Edited", room_names)

        resp = self.client.delete(f"/api/rooms/{room_id}/permanent", headers=admin_headers)
        self.assertEqual(resp.status_code, 204)

        resp = self.client.get(f"/api/rooms/{room_id}", headers=admin_headers)
        self.assertEqual(resp.status_code, 404)
