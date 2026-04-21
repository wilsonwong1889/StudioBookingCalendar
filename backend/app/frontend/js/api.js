import { API_BASE_URL } from "./config.js?v=20260421a";
import { state } from "./state.js?v=20260421a";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (state.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? data.detail
        : "Request failed";
    throw new Error(detail);
  }

  return data;
}

export const api = {
  getHealth() {
    return request("/health");
  },
  getPublicStaffProfiles() {
    return request("/api/staff");
  },
  signup(payload) {
    return request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(email, password) {
    const formData = new FormData();
    formData.append("username", email);
    formData.append("password", password);
    return request("/api/auth/login", {
      method: "POST",
      body: formData,
    });
  },
  loginWithGoogle(accessToken) {
    return request("/api/auth/google/exchange", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken }),
    });
  },
  verifyTwoFactor(payload) {
    return request("/api/auth/verify-2fa", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  resendTwoFactor(twoFactorToken) {
    return request("/api/auth/resend-2fa", {
      method: "POST",
      body: JSON.stringify({ two_factor_token: twoFactorToken }),
    });
  },
  getMe() {
    return request("/api/auth/me");
  },
  updateProfile(payload) {
    return request("/api/users/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  uploadProfileAvatar(file) {
    const formData = new FormData();
    formData.append("photo", file);
    return request("/api/users/me/avatar", {
      method: "POST",
      body: formData,
    });
  },
  deleteProfile(payload) {
    return request("/api/users/me", {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
  },
  updatePassword(payload) {
    return request("/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getRooms(includeInactive = false) {
    const query = includeInactive ? "?include_inactive=true" : "";
    return request(`/api/rooms${query}`);
  },
  getRoom(roomId) {
    return request(`/api/rooms/${roomId}`);
  },
  getAvailability(roomId, date) {
    return request(`/api/rooms/${roomId}/availability?date=${date}`);
  },
  getBookings() {
    return request("/api/bookings");
  },
  getBooking(bookingId) {
    return request(`/api/bookings/${bookingId}`);
  },
  getBookingReview(bookingId) {
    return request(`/api/bookings/${bookingId}/review`);
  },
  saveBookingReview(bookingId, payload) {
    return request(`/api/bookings/${bookingId}/review`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  getBookingPaymentSession(bookingId) {
    return request(`/api/bookings/${bookingId}/payment-session`, {
      method: "POST",
    });
  },
  createBooking(payload) {
    return request("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  createGuestBooking(payload) {
    return request("/api/bookings/guest", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  previewPromoCode(code, amountCents) {
    return request("/api/public/promo-codes/preview", {
      method: "POST",
      body: JSON.stringify({
        code,
        amount_cents: amountCents,
      }),
    });
  },
  cancelBooking(bookingId, payload) {
    return request(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  rescheduleBooking(bookingId, payload) {
    return request(`/api/bookings/${bookingId}/reschedule`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getRoomReviews(roomId, limit = 6) {
    return request(`/api/rooms/${roomId}/reviews?limit=${limit}`);
  },
  createRoom(payload) {
    return request("/api/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  archiveRoom(roomId) {
    return request(`/api/rooms/${roomId}`, {
      method: "DELETE",
    });
  },
  deleteRoomPermanently(roomId) {
    return request(`/api/rooms/${roomId}/permanent`, {
      method: "DELETE",
    });
  },
  restoreRoom(roomId) {
    return request(`/api/rooms/${roomId}/restore`, {
      method: "POST",
    });
  },
  adminLookupBookings(query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/admin/bookings${suffix}`);
  },
  adminClearBookingsForDay(payload) {
    return request("/api/admin/bookings/clear-day", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminClearPastBookings() {
    return request("/api/admin/bookings/clear-past", {
      method: "POST",
    });
  },
  getAdminAnalyticsSummary() {
    return request("/api/admin/analytics/summary");
  },
  getAdminUsers() {
    return request("/api/admin/users");
  },
  getAdminTestCases() {
    return request("/api/admin/test-cases");
  },
  getAdminActivity(limit = 12) {
    return request(`/api/admin/activity?limit=${limit}`);
  },
  getAdminStaffProfiles() {
    return request("/api/admin/staff");
  },
  getAdminPromoCodes() {
    return request("/api/admin/promo-codes");
  },
  adminCreatePromoCode(payload) {
    return request("/api/admin/promo-codes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminUpdatePromoCode(promoCodeId, payload) {
    return request(`/api/admin/promo-codes/${promoCodeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  adminCreateStaffProfile(payload) {
    return request("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminUpdateStaffProfile(staffProfileId, payload) {
    return request(`/api/admin/staff/${staffProfileId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  adminDeleteStaffProfile(staffProfileId) {
    return request(`/api/admin/staff/${staffProfileId}`, {
      method: "DELETE",
    });
  },
  adminUploadStaffPhoto(file) {
    const formData = new FormData();
    formData.append("photo", file);
    return request("/api/admin/staff/photo", {
      method: "POST",
      body: formData,
    });
  },
  adminUploadRoomPhoto(file) {
    const formData = new FormData();
    formData.append("photo", file);
    return request("/api/admin/rooms/photo", {
      method: "POST",
      body: formData,
    });
  },
  adminCreateManualBooking(payload) {
    return request("/api/admin/bookings/manual", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminRefundBooking(bookingId, payload) {
    return request(`/api/admin/bookings/${bookingId}/refund`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminCheckInBooking(bookingId) {
    return request(`/api/admin/bookings/${bookingId}/check-in`, {
      method: "POST",
    });
  },
  adminWaiveBookingPayment(bookingId) {
    return request(`/api/admin/bookings/${bookingId}/waive-payment`, {
      method: "POST",
    });
  },
  adminMarkBookingPaid(bookingId) {
    return request(`/api/admin/bookings/${bookingId}/mark-paid`, {
      method: "POST",
    });
  },
  adminDeleteUser(userId, payload) {
    return request(`/api/admin/users/${userId}`, {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
  },
  adminUpdateRoom(roomId, payload) {
    return request(`/api/admin/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};
