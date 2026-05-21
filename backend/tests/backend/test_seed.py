"""
Backend tests — seed helpers.

Verifies ensure_admin_user, ensure_rooms, and ensure_promo_codes produce
correct database records.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from tests.base import BaseAppTest


class SeedTest(BaseAppTest):

    def test_00_seed_helpers(self) -> None:
        with self.SessionLocal() as db:
            admin = type(self).ensure_admin_user(
                db,
                email="seed-admin@example.com",
                password="SeedAdmin123!",
                full_name="Seed Admin",
                phone="403-393-8857",
                role="AdminManager",
            )
            rooms = type(self).ensure_rooms(
                db,
                rooms=[
                    {
                        "name": "Seed Room",
                        "description": "Seeded room",
                        "capacity": 2,
                        "photos": [],
                        "hourly_rate_cents": 5000,
                    }
                ],
            )
            admin_email = admin.email
            admin_is_admin = admin.is_admin
            admin_phone = admin.phone
            admin_role = admin.role
            room_name = rooms[0].name
            room_count = len(rooms)
            default_seeded_rooms = type(self).ensure_rooms(db)
            promo_codes = type(self).ensure_promo_codes(db)
            seeded_promo = db.query(self.PromoCode).filter(self.PromoCode.code == "SUMMER60").one()
            seeded_promo_percent = seeded_promo.percent_off
            seeded_promo_active = seeded_promo.active

        self.assertEqual(admin_email, "seed-admin@example.com")
        self.assertTrue(admin_is_admin)
        self.assertEqual(admin_phone, "403-393-8857")
        self.assertEqual(admin_role, "AdminManager")
        self.assertEqual(room_count, 1)
        self.assertEqual(room_name, "Seed Room")
        self.assertIsInstance(default_seeded_rooms, list)
        self.assertEqual(len(promo_codes), 1)
        self.assertEqual(seeded_promo_percent, 60)
        self.assertTrue(seeded_promo_active)
