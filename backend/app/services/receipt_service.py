from __future__ import annotations

from datetime import datetime, timezone

from fpdf import FPDF
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.room import Room
from app.staffing import normalize_staff_roles


RECEIPT_ALLOWED_STATUSES = {"Paid", "Completed", "Refunded"}

# Brand colours
_RED = (215, 25, 32)
_NAVY = (13, 37, 69)
_LGREY = (245, 245, 245)
_MGREY = (218, 218, 218)
_DARK = (26, 26, 26)
_MID = (100, 100, 100)
_WHITE = (255, 255, 255)
_GREEN = (22, 150, 80)
_AMBER = (200, 110, 0)

PAGE_W = 215.9  # Letter width mm
MX = 14         # horizontal margin


def booking_receipt_available(booking: Booking) -> bool:
    return booking.status in RECEIPT_ALLOWED_STATUSES


def build_booking_receipt_filename(booking: Booking) -> str:
    code = booking.booking_code or "booking"
    return f"studio-booking-receipt-{code}.pdf"


def build_booking_receipt_pdf(db: Session, booking: Booking) -> bytes:
    room = db.query(Room).filter(Room.id == booking.room_id).first()
    return _build_pdf(booking, room)


# ── helpers ──────────────────────────────────────────────────────────────────

def _fill(pdf: FPDF, x: float, y: float, w: float, h: float, r: int, g: int, b: int) -> None:
    pdf.set_fill_color(r, g, b)
    pdf.rect(x, y, w, h, "F")


def _text(pdf: FPDF, x: float, y: float, text: str, font: str, style: str, size: float,
          r: int, g: int, b: int, w: float = 0, align: str = "L") -> None:
    pdf.set_font(font, style, size)
    pdf.set_text_color(r, g, b)
    pdf.set_xy(x, y)
    pdf.cell(w or (PAGE_W - x - MX), 6, text, border=0, align=align)


def _fmt_dt(value: datetime | None) -> str:
    if not value:
        return "N/A"
    return value.astimezone(timezone.utc).strftime("%B %d, %Y  %H:%M UTC")


def _fmt_money(cents: int | None, currency: str | None = None) -> str:
    safe = cents or 0
    curr = (currency or "CAD").upper()
    sign = "-" if safe < 0 else ""
    return f"{sign}{curr} {abs(safe) / 100:.2f}"


def _staff_names(booking: Booking) -> list[str]:
    return [
        a.get("name", "").strip()
        for a in normalize_staff_roles(booking.staff_assignments or [])
        if a.get("name")
    ]


# ── sections ─────────────────────────────────────────────────────────────────

def _header(pdf: FPDF) -> float:
    _fill(pdf, 0, 0, PAGE_W, 30, *_RED)
    _text(pdf, MX, 7, "bipoc foundation", "Helvetica", "B", 21, *_WHITE, w=130)
    _text(pdf, MX, 18, "Digital Media & Creative Innovation Hub", "Helvetica", "", 7.5, *_WHITE, w=130)
    _text(pdf, PAGE_W - MX - 46, 9, "RECEIPT", "Helvetica", "B", 26, *_WHITE, w=46, align="R")
    return 30.0


def _booking_band(pdf: FPDF, booking: Booking, y: float) -> float:
    _fill(pdf, 0, y, PAGE_W, 9, *_NAVY)
    code = booking.booking_code or "N/A"
    status = booking.status or "Unknown"
    _text(pdf, MX, y + 1.5, f"Booking #{code}   |   {status}", "Helvetica", "", 8, *_WHITE,
          w=PAGE_W - 2 * MX, align="C")
    return y + 9


def _bill_to(pdf: FPDF, booking: Booking, y: float) -> float:
    _fill(pdf, 0, y, PAGE_W, 30, *_LGREY)

    # Left — bill to
    _text(pdf, MX, y + 4, "BILL TO", "Helvetica", "B", 6.5, *_MID, w=85)
    name = booking.user_full_name_snapshot or "Studio Guest"
    _text(pdf, MX, y + 9.5, name, "Helvetica", "B", 11, *_DARK, w=85)
    email = booking.user_email_snapshot or ""
    _text(pdf, MX, y + 18, email, "Helvetica", "", 8.5, *_MID, w=85)

    # Right — date / status
    cx = PAGE_W / 2 + 6
    _text(pdf, cx, y + 4, "DATE ISSUED", "Helvetica", "B", 6.5, *_MID)
    now_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    _text(pdf, cx, y + 9.5, now_str, "Helvetica", "", 8.5, *_DARK)

    _text(pdf, cx, y + 19, "PAYMENT STATUS", "Helvetica", "B", 6.5, *_MID)
    status = booking.status or "Unknown"
    sc = _GREEN if status in ("Paid", "Completed") else _AMBER if status not in ("Cancelled",) else _MID
    _text(pdf, cx + 34, y + 19, status, "Helvetica", "B", 8.5, *sc)

    return y + 30


def _section_bar(pdf: FPDF, label: str, y: float) -> float:
    _fill(pdf, MX - 2, y, PAGE_W - 2 * MX + 4, 8, *_NAVY)
    _text(pdf, MX + 2, y + 1.5, label, "Helvetica", "B", 8, *_WHITE, w=PAGE_W - 2 * MX - 4)
    return y + 8


def _detail_row(pdf: FPDF, label: str, value: str, y: float, alt: bool) -> float:
    if alt:
        _fill(pdf, MX - 2, y, PAGE_W - 2 * MX + 4, 7, 250, 250, 250)
    _text(pdf, MX + 2, y + 1.5, label, "Helvetica", "", 8.5, *_MID, w=55)
    _text(pdf, MX + 58, y + 1.5, value, "Helvetica", "", 8.5, *_DARK, w=PAGE_W - MX - 58 - 12)
    return y + 7


def _booking_details(pdf: FPDF, booking: Booking, room: Room | None, y: float) -> float:
    y = _section_bar(pdf, "BOOKING DETAILS", y)
    room_name = room.name if room else "Studio Booking"
    dur_hrs = (booking.duration_minutes or 0) // 60
    dur_label = f"{dur_hrs} hour{'s' if dur_hrs != 1 else ''}"
    names = _staff_names(booking)

    rows = [
        ("Room / Studio", room_name),
        ("Start time", _fmt_dt(booking.start_time)),
        ("End time", _fmt_dt(booking.end_time)),
        ("Duration", dur_label),
    ]
    if names:
        rows.append(("Staff / Engineer", ", ".join(names)))
    if booking.note:
        rows.append(("Notes", booking.note))

    for i, (lbl, val) in enumerate(rows):
        y = _detail_row(pdf, lbl, val, y, i % 2 == 1)
    return y


def _money_row(pdf: FPDF, label: str, cents: int, y: float, *,
               alt: bool = False, bold: bool = False,
               color: tuple[int, int, int] | None = None) -> float:
    row_h = 7
    if bold:
        _fill(pdf, MX - 2, y, PAGE_W - 2 * MX + 4, row_h, *_LGREY)
    elif alt:
        _fill(pdf, MX - 2, y, PAGE_W - 2 * MX + 4, row_h, 250, 250, 250)

    style = "B" if bold else ""
    size = 9.5 if bold else 8.5
    tc = _DARK if (bold or color is None) else color

    _text(pdf, MX + 2, y + 1.5, label, "Helvetica", style, size, *(_DARK if bold else _MID),
          w=PAGE_W - MX - 55)
    val_x = PAGE_W - MX - 44
    _text(pdf, val_x, y + 1.5, _fmt_money(cents), "Helvetica", style, size, *(color or tc),
          w=44, align="R")
    return y + row_h


def _payment_summary(pdf: FPDF, booking: Booking, y: float) -> float:
    y = _section_bar(pdf, "PAYMENT SUMMARY", y)

    total = booking.price_cents or 0
    tax = booking.tax_cents or 0
    discount = booking.discount_cents or 0
    subtotal = total - tax
    original = booking.original_price_cents if (booking.original_price_cents and discount) else subtotal

    alt = False
    if discount:
        y = _money_row(pdf, "Subtotal (before discount)", original, y, alt=alt); alt = not alt
        y = _money_row(pdf, "Discount", -discount, y, alt=alt, color=_GREEN); alt = not alt

    y = _money_row(pdf, "Subtotal", subtotal, y, alt=alt); alt = not alt
    y = _money_row(pdf, "GST (5%)", tax, y, alt=alt); alt = not alt

    # separator
    pdf.set_draw_color(*_MGREY)
    pdf.set_line_width(0.3)
    pdf.line(MX, y, PAGE_W - MX, y)
    y += 1

    y = _money_row(pdf, "TOTAL", total, y, bold=True)
    y += 2

    if booking.deposit_amount_cents:
        dep_label = "Deposit paid" if booking.deposit_paid else "Deposit due"
        dep_color = _GREEN if booking.deposit_paid else _AMBER
        y = _money_row(pdf, dep_label, booking.deposit_amount_cents, y, color=dep_color); y += 1

    if booking.payment_intent_id:
        _text(pdf, MX + 2, y + 1, f"Payment ref: {booking.payment_intent_id}",
              "Helvetica", "", 7, *_MID, w=PAGE_W - 2 * MX - 4)
        y += 6

    return y


def _footer(pdf: FPDF) -> None:
    y = 262.0
    pdf.set_draw_color(*_MGREY)
    pdf.set_line_width(0.3)
    pdf.line(MX, y, PAGE_W - MX, y)
    _text(pdf, MX, y + 3, "Thank you for choosing BIPOC Foundation Digital Media & Creative Innovation Hub",
          "Helvetica", "B", 8, *_DARK, w=PAGE_W - 2 * MX, align="C")
    _text(pdf, MX, y + 10, "2525 36 St N, Lethbridge, AB T1H 5L1   |   403-393-8857   |   lethsmakeithappen@bipocfoundation.org",
          "Helvetica", "", 7, *_MID, w=PAGE_W - 2 * MX, align="C")


# ── main builder ─────────────────────────────────────────────────────────────

def _build_pdf(booking: Booking, room: Room | None) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="Letter")
    pdf.set_margins(0, 0, 0)
    pdf.set_auto_page_break(False)
    pdf.add_page()

    y = _header(pdf)
    y = _booking_band(pdf, booking, y)
    y = _bill_to(pdf, booking, y)
    y += 5
    y = _booking_details(pdf, booking, room, y)
    y += 5
    y = _payment_summary(pdf, booking, y)
    _footer(pdf)

    return bytes(pdf.output())
