import { API_BASE_URL } from "./config.js?v=20260401r";
import { state } from "./state.js?v=20260401r";

function getDownloadFilename(contentDisposition, fallback) {
  const match = /filename="([^"]+)"/i.exec(contentDisposition || "");
  return match?.[1] || fallback;
}

export async function downloadBookingReceiptPdf(bookingId, bookingCode = "booking") {
  const headers = new Headers();
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/receipt`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? payload.detail
        : "Receipt download failed";
    throw new Error(detail);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getDownloadFilename(
    response.headers.get("content-disposition"),
    `studio-booking-receipt-${bookingCode}.pdf`,
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
