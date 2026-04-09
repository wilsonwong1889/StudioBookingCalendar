from __future__ import annotations

from datetime import datetime, timezone
from textwrap import wrap
from unicodedata import normalize

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.room import Room
from app.staffing import normalize_staff_roles


RECEIPT_ALLOWED_STATUSES = {"Paid", "Completed", "Refunded"}


def booking_receipt_available(booking: Booking) -> bool:
    return booking.status in RECEIPT_ALLOWED_STATUSES


def build_booking_receipt_filename(booking: Booking) -> str:
    code = booking.booking_code or "booking"
    return f"studio-booking-receipt-{code}.pdf"


def build_booking_receipt_pdf(db: Session, booking: Booking) -> bytes:
    room = db.query(Room).filter(Room.id == booking.room_id).first()
    lines = _build_receipt_lines(booking, room)
    return _build_simple_pdf(lines)


def _build_receipt_lines(booking: Booking, room: Room | None) -> list[str]:
    staff_names = [
        assignment.get("name", "").strip()
        for assignment in normalize_staff_roles(booking.staff_assignments or [])
        if assignment.get("name")
    ]
    guest_name = booking.user_full_name_snapshot or "Studio guest"
    guest_email = booking.user_email_snapshot or "Account email unavailable"
    room_name = room.name if room else "Studio booking"
    created_at = _format_datetime(booking.created_at, fallback="Not available")
    confirmed_at = _format_datetime(booking.confirmed_at, fallback="Not yet confirmed")
    checked_in_at = _format_datetime(booking.checked_in_at, fallback="Not checked in")
    cancelled_at = _format_datetime(booking.cancelled_at, fallback="Not cancelled")
    settlement = _describe_settlement(booking)
    note = booking.note or "No booking notes added."
    payment_reference = booking.payment_intent_id or "No payment reference"
    lines = [
        "StudioBookingSoftware",
        "Booking receipt",
        "",
        f"Booking code: {booking.booking_code}",
        f"Receipt generated: {_format_datetime(datetime.now(timezone.utc), fallback='Not available')}",
        f"Guest: {guest_name}",
        f"Email: {guest_email}",
        f"Room: {room_name}",
        f"Starts: {_format_datetime(booking.start_time, fallback='Not available')}",
        f"Ends: {_format_datetime(booking.end_time, fallback='Not available')}",
        f"Duration: {int((booking.duration_minutes or 0) / 60)} hour{'s' if booking.duration_minutes != 60 else ''}",
        f"Status: {booking.status}",
        *( [f"Original amount: {_format_currency(booking.original_price_cents, booking.currency)}"] if booking.original_price_cents is not None and booking.discount_cents else [] ),
        *( [f"Discount: -{_format_currency(booking.discount_cents, booking.currency)}"] if booking.discount_cents else [] ),
        *( [f"Promo code: {booking.promo_code}"] if booking.promo_code else [] ),
        f"Amount: {_format_currency(booking.price_cents, booking.currency)}",
        f"Payment reference: {payment_reference}",
        f"Settlement: {settlement}",
        f"Booked at: {created_at}",
    ]
    if confirmed_at != "Not yet confirmed":
        lines.append(f"Confirmed at: {confirmed_at}")
    if checked_in_at != "Not checked in":
        lines.append(f"Checked in at: {checked_in_at}")
    if cancelled_at != "Not cancelled":
        lines.append(f"Cancelled at: {cancelled_at}")
    if staff_names:
        lines.append(f"Staff: {', '.join(staff_names)}")
    lines.append(f"Notes: {note}")
    lines.append("")
    lines.append("Thank you for booking with StudioBookingSoftware.")
    return _wrap_lines(lines)


def _describe_settlement(booking: Booking) -> str:
    payment_reference = str(booking.payment_intent_id or "")
    if booking.price_cents == 0 and payment_reference.startswith("admin_waived_"):
        return "Admin skipped Stripe and confirmed this booking for free."
    if payment_reference.startswith("admin_manual_paid_"):
        return "Admin marked this booking paid manually."
    if booking.status == "Refunded":
        return "This booking has a processed refund state."
    if booking.confirmed_at:
        return f"Payment confirmed {_format_datetime(booking.confirmed_at, fallback='Not yet confirmed')}."
    return f"Booking status is {booking.status}."


def _format_currency(cents: int | None, currency: str | None) -> str:
    safe_cents = cents or 0
    safe_currency = (currency or "CAD").upper()
    return f"{safe_currency} {safe_cents / 100:.2f}"


def _format_datetime(value: datetime | None, *, fallback: str) -> str:
    if not value:
        return fallback
    normalized_value = value.astimezone(timezone.utc)
    return normalized_value.strftime("%Y-%m-%d %H:%M UTC")


def _wrap_lines(lines: list[str], width: int = 76) -> list[str]:
    wrapped: list[str] = []
    for line in lines:
        if not line:
            wrapped.append("")
            continue
        wrapped.extend(wrap(line, width=width, break_long_words=True, break_on_hyphens=False) or [""])
    return wrapped


def _sanitize_pdf_text(value: str) -> str:
    ascii_value = normalize("NFKD", str(value)).encode("ascii", "replace").decode("ascii")
    return ascii_value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(lines: list[str]) -> bytes:
    commands = [
        "BT",
        "/F1 18 Tf",
        "50 780 Td",
    ]

    for index, line in enumerate(lines):
        safe_line = _sanitize_pdf_text(line)
        if index == 0:
            commands.append(f"({safe_line}) Tj")
            commands.append("/F1 11 Tf")
            continue
        commands.append("0 -18 Td")
        commands.append(f"({safe_line}) Tj")

    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n%b\nendstream" % (len(stream), stream),
    ]

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        if not obj.endswith(b"\n"):
            pdf.extend(b"\n")
        pdf.extend(b"endobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n".encode("ascii"))
    pdf.extend(f"startxref\n{xref_offset}\n%%EOF".encode("ascii"))
    return bytes(pdf)
