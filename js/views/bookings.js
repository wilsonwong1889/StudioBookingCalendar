import { api } from "../api.js?v=20260427a";
import { getSearchParam } from "../config.js?v=20260422d";
import { elements } from "../dom.js?v=20260427a";
import { persistCheckoutDraft, persistLastBookingId, persistToken, setState, state } from "../state.js?v=20260427a";

const MIN_DURATION_MINUTES = 60;
const MAX_DURATION_MINUTES = 300;
let selectedStaffIds = new Set();
let bookingHistoryTab = "upcoming";
let bookingHistoryKind = "all";
let bookingPromoPreview = null;
let bookingPromoMessage = "";
const BOOKING_VISUALS = {
  recording: "/assets/media/studio-room-2.png",
  podcast: "/assets/media/studio-lobby-2.png",
  photography: "/assets/media/studio-room-2.png",
  film: "/assets/media/studio-exterior-2.png",
  dance: "/assets/media/studio-exterior-2.png",
  production: "/assets/media/studio-room-2.png",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatBookingDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBookingDay(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTimeOnly(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes) {
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format((cents || 0) / 100);
}

function inferBookingCategory(booking) {
  const text = `${booking.room_name || ""} ${booking.note || ""}`.toLowerCase();
  if (text.includes("podcast")) {
    return "podcast";
  }
  if (text.includes("photo")) {
    return "photography";
  }
  if (text.includes("film")) {
    return "film";
  }
  if (text.includes("dance")) {
    return "dance";
  }
  if (text.includes("production")) {
    return "production";
  }
  return "recording";
}

function getBookingVisual(booking) {
  return BOOKING_VISUALS[inferBookingCategory(booking)] || BOOKING_VISUALS.recording;
}

function formatStatusLabel(status) {
  return String(status || "Unknown")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function getStatusClassName(status) {
  return `status-${String(status || "unknown").toLowerCase()}`;
}

function getBookingSortValue(value) {
  return value ? new Date(value).getTime() : 0;
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBookingCount(count) {
  return `${count} booking${count === 1 ? "" : "s"}`;
}

function getBookingKind(booking) {
  const explicitKind = String(booking?.booking_kind || booking?.kind || booking?.type || "").toLowerCase();
  if (explicitKind === "staff") {
    return "staff";
  }
  if (explicitKind === "room") {
    return "room";
  }
  if (booking?.staff_profile_id || booking?.staff_profile_name || booking?.staff_name || booking?.service_type) {
    return "staff";
  }
  return "room";
}

function getBookingDisplayName(booking) {
  if (getBookingKind(booking) === "staff") {
    return (
      booking?.staff_name ||
      booking?.staff_profile_name ||
      booking?.staff_profile?.name ||
      booking?.service_type ||
      "Staff booking"
    );
  }
  return booking?.room_name || "Studio booking";
}

function getBookingTypeLabel(booking) {
  return getBookingKind(booking) === "staff" ? "Staff" : "Room";
}

function getBookingTypeBadgeClass(booking) {
  return getBookingKind(booking) === "staff"
    ? "booking-card-category booking-card-kind-staff"
    : "booking-card-category booking-card-kind-room";
}

function getBookingDetailHref(booking) {
  const href = new URL("/booking", window.location.origin);
  href.searchParams.set("id", booking.id);
  if (getBookingKind(booking) === "staff") {
    href.searchParams.set("kind", "staff");
  }
  return href.pathname + href.search;
}

function getBookingImage(booking) {
  if (getBookingKind(booking) === "staff" && (booking?.staff_photo_url || booking?.photo_url)) {
    return booking.staff_photo_url || booking.photo_url;
  }
  return getBookingVisual(booking);
}

function getBookingLocationLabel(booking) {
  if (getBookingKind(booking) === "staff") {
    return booking?.location_label || "Studio support session";
  }
  return booking?.location_label || "Downtown studio district";
}

function bookingMatchesKindFilter(booking, filter) {
  if (filter === "all") {
    return true;
  }
  return getBookingKind(booking) === filter;
}

function getFilteredBookingCounts(bookings) {
  return bookings.reduce(
    (counts, booking) => {
      const kind = getBookingKind(booking);
      counts.all += 1;
      if (kind === "staff") {
        counts.staff += 1;
      } else {
        counts.rooms += 1;
      }
      return counts;
    },
    { all: 0, rooms: 0, staff: 0 },
  );
}

function getFilteredBookingCollection(bookings) {
  return bookings.filter((booking) => bookingMatchesKindFilter(booking, bookingHistoryKind));
}

function getBookingsEmptyMessage(scope) {
  const kindLabel = bookingHistoryKind === "staff" ? "staff" : bookingHistoryKind === "rooms" ? "room" : "booking";
  const kindPrefix = bookingHistoryKind === "all" ? "" : `${kindLabel} `;
  if (scope === "upcoming") {
    return bookingHistoryKind === "all"
      ? "No upcoming bookings yet. New room and staff reservations will appear here."
      : `No upcoming ${kindPrefix}bookings yet.`;
  }
  return bookingHistoryKind === "all"
    ? "No past or cancelled bookings yet."
    : `No past or cancelled ${kindPrefix}bookings yet.`;
}

function getBookingPromoCodeInput() {
  return document.getElementById("booking-promo-code-input");
}

function getBookingPromoFeedback() {
  return document.getElementById("booking-promo-feedback");
}

function getBookingPromoSelectionKey(roomId, durationMinutes, amountCents) {
  return JSON.stringify({
    roomId: String(roomId || ""),
    durationMinutes: Number(durationMinutes || 0),
    amountCents: Number(amountCents || 0),
    staffIds: [...selectedStaffIds].sort(),
  });
}

function getBookingPromoInputValue() {
  return getBookingPromoCodeInput()?.value?.trim()?.toUpperCase() || "";
}

function getBookingPromoContext(room, durationMinutes) {
  if (!room) {
    return null;
  }

  const amountCents = calculateEstimatedTotal(room, durationMinutes);
  return {
    amountCents,
    selectionKey: getBookingPromoSelectionKey(room.id, durationMinutes, amountCents),
  };
}

function clearBookingPromoState(message = "") {
  bookingPromoPreview = null;
  bookingPromoMessage = message;
}

function invalidateBookingPromoIfNeeded(room, durationMinutes) {
  if (!bookingPromoPreview || !room) {
    return;
  }

  const context = getBookingPromoContext(room, durationMinutes);
  if (!context || bookingPromoPreview.selectionKey !== context.selectionKey) {
    clearBookingPromoState("Selection changed. Apply promo again to refresh the total.");
  }
}

function renderBookingPromoFeedback() {
  const feedback = getBookingPromoFeedback();
  if (!feedback) {
    return;
  }

  if (bookingPromoPreview) {
    feedback.classList.remove("hidden");
    feedback.className = "empty-state booking-promo-feedback booking-promo-feedback-success";
    feedback.innerHTML = `
      <strong>${bookingPromoPreview.code} applied</strong>
      <span>Discount ${formatCurrency(bookingPromoPreview.discount_cents)}. New estimated total ${formatCurrency(bookingPromoPreview.final_amount_cents)}.</span>
    `;
    return;
  }

  if (bookingPromoMessage) {
    feedback.classList.remove("hidden");
    feedback.className = "empty-state booking-promo-feedback booking-promo-feedback-error";
    feedback.innerHTML = `<strong>Promo update</strong><span>${bookingPromoMessage}</span>`;
    return;
  }

  feedback.className = "empty-state booking-promo-feedback hidden";
  feedback.innerHTML = "";
}

async function applyBookingPromoPreview(currentState) {
  const code = getBookingPromoInputValue();
  const selectedRoom = currentState.rooms.find((room) => String(room.id) === elements.bookingRoomSelect.value);
  const durationMinutes = getSelectedDuration();
  const context = getBookingPromoContext(selectedRoom, durationMinutes);

  if (!selectedRoom || !context) {
    clearBookingPromoState("Choose a room and duration before applying a promo code.");
    renderBookingPromoFeedback();
    renderBookingSummary(currentState);
    return;
  }

  if (!code) {
    clearBookingPromoState("Enter a promo code first.");
    renderBookingPromoFeedback();
    renderBookingSummary(currentState);
    return;
  }

  try {
    setState({ message: "Checking promo code..." });
    const preview = await api.previewPromoCode(code, context.amountCents);
    bookingPromoPreview = {
      ...preview,
      selectionKey: context.selectionKey,
    };
    bookingPromoMessage = "";
    setState({ message: `${preview.code} applied.` });
  } catch (error) {
    clearBookingPromoState(error.message);
    setState({ message: error.message });
  }

  renderBookingPromoFeedback();
  renderBookingSummary(currentState);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBookingStatusLabel(booking) {
  if (booking.status === "PendingPayment") {
    return "Pending payment";
  }
  if (booking.status === "Paid") {
    return isBookingUpcoming(booking) ? "Confirmed" : "Paid";
  }
  return formatStatusLabel(booking.status);
}

function getBookingLifecycleTimeValue(booking) {
  if (booking.status === "PendingPayment") {
    return getBookingSortValue(booking.payment_expires_at || booking.start_time || booking.created_at);
  }
  if (booking.status === "Paid") {
    return getBookingSortValue(booking.confirmed_at || booking.start_time || booking.created_at);
  }
  if (booking.status === "Completed") {
    return getBookingSortValue(booking.checked_in_at || booking.end_time || booking.start_time || booking.created_at);
  }
  if (booking.status === "Refunded") {
    return getBookingSortValue(booking.updated_at || booking.created_at || booking.start_time);
  }
  if (booking.status === "Cancelled") {
    return getBookingSortValue(booking.cancelled_at || booking.created_at || booking.start_time);
  }
  return getBookingSortValue(booking.start_time || booking.created_at);
}

function isBookingUpcoming(booking) {
  if (booking.status === "PendingPayment") {
    return true;
  }
  if (booking.status !== "Paid") {
    return false;
  }
  return getBookingSortValue(booking.end_time || booking.start_time) > Date.now();
}

function getUpcomingBookings(bookings) {
  return bookings
    .filter((booking) => isBookingUpcoming(booking))
    .sort((left, right) => {
      return (
        getBookingSortValue(left.start_time || left.payment_expires_at || left.created_at) -
        getBookingSortValue(right.start_time || right.payment_expires_at || right.created_at)
      );
    });
}

function getHistoryBookings(bookings) {
  return bookings
    .filter((booking) => !isBookingUpcoming(booking) && ["Paid", "Completed", "Cancelled", "Refunded"].includes(booking.status))
    .sort((left, right) => getBookingLifecycleTimeValue(right) - getBookingLifecycleTimeValue(left));
}

function renderBookingCollection(bookings, emptyMessage, { upcoming = false } = {}) {
  if (!bookings.length) {
    return `
      <div class="empty-state">
        ${emptyMessage}
      </div>
    `;
  }

  return bookings.map((booking) => renderBookingCard(booking, { upcoming })).join("");
}

function getBookingGuestFields() {
  return document.getElementById("booking-guest-fields");
}

function getBookingGuestNameInput() {
  return document.getElementById("booking-guest-name");
}

function getBookingGuestPhoneInput() {
  return document.getElementById("booking-guest-phone");
}

function buildDurationValues(limitMinutes = MAX_DURATION_MINUTES) {
  const safeLimit = Math.max(MIN_DURATION_MINUTES, Math.min(limitMinutes, MAX_DURATION_MINUTES));
  const values = [];
  for (let duration = MIN_DURATION_MINUTES; duration <= safeLimit; duration += MIN_DURATION_MINUTES) {
    values.push(duration);
  }
  return values;
}

function renderStaffImage(photoUrl, label) {
  if (photoUrl) {
    return `<img class="staff-avatar" src="${photoUrl}" alt="${label}" loading="lazy" />`;
  }
  return `<div class="staff-avatar staff-avatar-fallback">${label.slice(0, 1).toUpperCase()}</div>`;
}

function renderTagGroup(label, values = []) {
  if (!values.length) {
    return "";
  }

  return `
    <div class="staff-tag-group">
      <span>${label}</span>
      <div class="preview-pill-row">
        ${values.map((value) => `<span class="pill">${value}</span>`).join("")}
      </div>
    </div>
  `;
}

function getSelectedDuration() {
  return Number(elements.bookingDurationSelect?.value || MIN_DURATION_MINUTES);
}

function getSelectedRoom() {
  return state.rooms.find((room) => String(room.id) === elements.bookingRoomSelect?.value);
}

function getSelectedStaffOptions(room) {
  const roles = room?.staff_roles || [];
  return roles.filter((role) => selectedStaffIds.has(role.id));
}

function calculateEstimatedTotal(room, durationMinutes) {
  const baseRate = (room?.hourly_rate_cents || 0) * (durationMinutes / 60);
  const staffTotal = getSelectedStaffOptions(room).reduce(
    (total, role) => total + (role.add_on_price_cents || 0),
    0,
  );
  return baseRate + staffTotal;
}

function renderSelectedStaffBreakdown(room) {
  const selectedStaff = getSelectedStaffOptions(room);
  if (!selectedStaff.length) {
    return '<div class="summary-line"><span>Staff add-ons</span><strong>None selected</strong></div>';
  }

  return selectedStaff
    .map(
      (role) => `
        <div class="summary-line">
          <span>${role.name}</span>
          <strong>${formatCurrency(role.add_on_price_cents)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderStaffOptions(currentState) {
  if (!elements.bookingStaffSection || !elements.bookingStaffOptions) {
    return;
  }

  const emptyState = elements.bookingStaffSection.querySelector("[data-booking-staff-empty]");
  const countPill = elements.bookingStaffSection.querySelector("[data-booking-staff-count]");
  const room = currentState.rooms.find((item) => String(item.id) === elements.bookingRoomSelect?.value);
  if (!room) {
    selectedStaffIds = new Set();
    elements.bookingStaffOptions.innerHTML = "";
    elements.bookingStaffOptions.classList.add("hidden");
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.textContent = "Choose a room to preview available staff for this session.";
    }
    if (countPill) {
      countPill.classList.add("hidden");
      countPill.textContent = "";
    }
    return;
  }

  const staffRoles = room.staff_roles || [];
  if (!staffRoles.length) {
    selectedStaffIds = new Set();
    elements.bookingStaffOptions.innerHTML = "";
    elements.bookingStaffOptions.classList.add("hidden");
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.textContent = `No staff profiles are assigned to ${room.name} yet.`;
    }
    if (countPill) {
      countPill.classList.add("hidden");
      countPill.textContent = "";
    }
    return;
  }

  const availableIds = new Set(staffRoles.map((role) => role.id));
  selectedStaffIds = new Set([...selectedStaffIds].filter((roleId) => availableIds.has(roleId)));

  if (emptyState) {
    emptyState.classList.add("hidden");
  }
  elements.bookingStaffOptions.classList.remove("hidden");
  if (countPill) {
    const selectedCount = staffRoles.filter((role) => selectedStaffIds.has(role.id)).length;
    countPill.classList.remove("hidden");
    countPill.textContent = selectedCount
      ? `${selectedCount} selected of ${staffRoles.length}`
      : `${staffRoles.length} available`;
  }
  elements.bookingStaffOptions.innerHTML = staffRoles
    .map(
      (role) => `
        <label class="staff-option-card">
          <div class="staff-option-toggle">
            <input type="checkbox" value="${role.id}" ${selectedStaffIds.has(role.id) ? "checked" : ""} />
          </div>
          ${renderStaffImage(role.photo_url, role.name)}
          <div class="staff-option-copy">
            <strong>${role.name}</strong>
            <span>${role.description || "Optional staff support for this booking."}</span>
            ${renderTagGroup("Skills", role.skills || [])}
            ${renderTagGroup("Talents", role.talents || [])}
          </div>
          <strong class="staff-option-price">${formatCurrency(role.add_on_price_cents)}</strong>
        </label>
      `,
    )
    .join("");
}

function renderDurationOptions() {
  if (!elements.bookingStartSelect || !elements.bookingDurationSelect) {
    return;
  }
  const selectedStart = elements.bookingStartSelect.value;
  const maxDuration = state.availability?.max_duration_minutes_by_start?.[selectedStart];
  const previousValue = Number(elements.bookingDurationSelect.value || MIN_DURATION_MINUTES);

  const allowedDurations = buildDurationValues(maxDuration || MAX_DURATION_MINUTES);
  elements.bookingDurationSelect.innerHTML = allowedDurations
    .map((duration) => `<option value="${duration}">${formatDuration(duration)}</option>`)
    .join("");
  elements.bookingDurationSelect.value = allowedDurations.includes(previousValue)
    ? String(previousValue)
    : String(MIN_DURATION_MINUTES);
}

function renderAvailabilitySummary() {
  if (!elements.availabilitySummary) {
    return;
  }
  const availability = state.availability;
  if (!availability) {
    elements.availabilitySummary.classList.add("hidden");
    elements.availabilitySummary.textContent = "";
    return;
  }

  const count = availability.available_start_times.length;
  const roomName = state.rooms.find((room) => String(room.id) === elements.bookingRoomSelect.value)?.name || "selected room";
  elements.availabilitySummary.classList.remove("hidden");
  elements.availabilitySummary.innerHTML =
    count > 0
      ? `
        <strong>${count} available start times</strong>
        <span>${roomName} on ${availability.date} in ${availability.timezone}.</span>
      `
      : `
        <strong>No openings found</strong>
        <span>${roomName} has no bookable start times on ${availability.date}.</span>
      `;
}

function applyRequestedRoomSelection(currentState) {
  const requestedRoomId = getSearchParam("room") || getSearchParam("id");
  if (!requestedRoomId || !elements.bookingRoomSelect) {
    return;
  }

  const requestedRoomExists = currentState.rooms.some(
    (room) => String(room.id) === requestedRoomId && room.active,
  );
  if (requestedRoomExists) {
    elements.bookingRoomSelect.value = requestedRoomId;
  }
}

function renderStartTimeOptions(currentState) {
  if (!elements.bookingStartSelect || !elements.bookingDurationSelect) {
    return;
  }
  const availability = currentState.availability;
  if (!availability) {
    elements.bookingStartSelect.innerHTML = "";
    renderDurationOptions();
    return;
  }

  const existingValue = elements.bookingStartSelect.value;
  const options = availability.available_start_times.map((startTime) => {
    const label = formatBookingDate(startTime);
    return `<option value="${startTime}">${label}</option>`;
  });

  elements.bookingStartSelect.innerHTML = options.join("");
  if (availability.available_start_times.includes(existingValue)) {
    elements.bookingStartSelect.value = existingValue;
  } else {
    elements.bookingStartSelect.value = availability.available_start_times[0] || "";
  }
  renderDurationOptions();
}

function renderSlotList(currentState) {
  if (!elements.bookingSlotList) {
    return;
  }

  const availability = currentState.availability;
  if (!availability?.available_start_times?.length) {
    elements.bookingSlotList.classList.add("hidden");
    elements.bookingSlotList.innerHTML = "";
    return;
  }

  const selectedStart = elements.bookingStartSelect.value;
  elements.bookingSlotList.classList.remove("hidden");
  elements.bookingSlotList.innerHTML = availability.available_start_times
    .map((startTime) => {
      const isActive = startTime === selectedStart;
      const maxDuration = availability.max_duration_minutes_by_start[startTime];
      return `
        <button
          class="slot-card ${isActive ? "is-selected" : ""}"
          type="button"
          data-slot-start="${startTime}"
        >
          <strong>${formatTimeOnly(startTime)}</strong>
          <span>Up to ${formatDuration(Math.min(maxDuration, MAX_DURATION_MINUTES))}</span>
        </button>
      `;
    })
    .join("");
}

function renderBookingSummary(currentState) {
  if (!elements.bookingSummaryCard || !elements.bookingSummaryTitle || !elements.bookingSummaryMeta) {
    return;
  }

  const selectedRoom = currentState.rooms.find((room) => String(room.id) === elements.bookingRoomSelect.value);
  const selectedStart = elements.bookingStartSelect?.value;
  const selectedDuration = getSelectedDuration();

  if (!selectedRoom) {
    elements.bookingSummaryTitle.textContent = "Pick a room and date";
    elements.bookingSummaryMeta.innerHTML = `
      <div class="empty-state">Choose a room and load availability to see your selection details here.</div>
    `;
    return;
  }

  if (!selectedStart) {
    elements.bookingSummaryTitle.textContent = selectedRoom.name;
    elements.bookingSummaryMeta.innerHTML = `
      <div class="summary-stack">
        <div class="summary-line"><span>Rate</span><strong>${new Intl.NumberFormat("en-US", { style: "currency", currency: "CAD" }).format((selectedRoom.hourly_rate_cents || 0) / 100)}/hour CAD</strong></div>
        <div class="summary-line"><span>Date</span><strong>${elements.bookingDateInput.value || "Select a date"}</strong></div>
        ${renderSelectedStaffBreakdown(selectedRoom)}
        <div class="empty-state">Load availability and pick a start time to continue.</div>
      </div>
    `;
    return;
  }

  const estimatedPrice = calculateEstimatedTotal(selectedRoom, selectedDuration);
  const promoSelectionKey = getBookingPromoSelectionKey(selectedRoom.id, selectedDuration, estimatedPrice);
  const activePromo =
    bookingPromoPreview &&
    bookingPromoPreview.selectionKey === promoSelectionKey &&
    bookingPromoPreview.code === getBookingPromoInputValue()
      ? bookingPromoPreview
      : null;
  elements.bookingSummaryTitle.textContent = `${selectedRoom.name} at ${formatTimeOnly(selectedStart)}`;
  elements.bookingSummaryMeta.innerHTML = `
    <div class="summary-stack">
      <div class="summary-line"><span>Date</span><strong>${formatBookingDate(selectedStart)}</strong></div>
      <div class="summary-line"><span>Duration</span><strong>${formatDuration(selectedDuration)}</strong></div>
      ${renderSelectedStaffBreakdown(selectedRoom)}
      ${
        activePromo
          ? `
            <div class="summary-line"><span>Original amount</span><strong>${formatCurrency(estimatedPrice)}</strong></div>
            <div class="summary-line"><span>Promo</span><strong>${activePromo.code}</strong></div>
            <div class="summary-line"><span>Discount</span><strong>-${formatCurrency(activePromo.discount_cents)}</strong></div>
            <div class="summary-line"><span>Estimated total</span><strong>${formatCurrency(activePromo.final_amount_cents)} CAD</strong></div>
          `
          : `<div class="summary-line"><span>Estimated total</span><strong>${formatCurrency(estimatedPrice)} CAD</strong></div>`
      }
      <div class="summary-line"><span>Booking access</span><strong>${currentState.currentUser ? "Ready to submit" : "Guest checkout ready"}</strong></div>
    </div>
  `;
}

function renderBookingCard(booking, { upcoming = false } = {}) {
  const pendingPayment = booking.status === "PendingPayment";
  const kind = getBookingKind(booking);
  const category = inferBookingCategory(booking);
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const bookingVisual = getBookingImage(booking);
  const bookingTypeLabel = getBookingTypeLabel(booking);
  const bookingTitle = getBookingDisplayName(booking);
  const bookingServiceLabel = booking.service_type || booking.location_label || getBookingLocationLabel(booking);
  const bookingStatusLabel = getBookingStatusLabel(booking);
  const bookingDateLabel = formatBookingDay(booking.start_time);
  const bookingTimeLabel = `${formatTimeOnly(booking.start_time)} · ${formatDuration(booking.duration_minutes)}`;
  const bookingTotalLabel = formatCurrency(booking.price_cents);
  const actionLabel = pendingPayment ? "Finish payment" : upcoming ? "Manage booking" : "View details";
  const actionClass = pendingPayment ? "primary-button primary-link" : "ghost-button ghost-link";
  const canCancel = upcoming && ["PendingPayment", "Paid"].includes(booking.status);
  const supportCopy = pendingPayment
    ? typeof booking.payment_seconds_remaining === "number"
      ? `Checkout expires in ${formatCountdown(booking.payment_seconds_remaining)}`
      : kind === "staff"
        ? "Finish payment to keep the staff session reserved."
        : "Finish payment to keep the reservation"
    : upcoming
      ? "No refunds within 24h"
      : booking.status === "Cancelled"
        ? "Reservation cancelled"
        : "Reservation history";
  return `
    <article class="booking-card ${pendingPayment ? "booking-card-pending" : "booking-card-secondary"}">
      <a class="booking-card-main" href="${getBookingDetailHref(booking)}">
        <div class="booking-card-media">
          <img class="booking-card-image" src="${bookingVisual}" alt="${escapeHtml(bookingTitle)}" loading="lazy" />
        </div>
        <div class="booking-card-copy">
          <div class="booking-card-heading">
            <div class="booking-card-title-row">
              <h4>${escapeHtml(bookingTitle)}</h4>
              <span class="pill ${kind === "staff" ? "booking-card-type-booking" : getBookingTypeBadgeClass(booking)}">${bookingTypeLabel}</span>
              ${kind === "staff" && bookingServiceLabel ? `<span class="pill booking-card-category">${escapeHtml(bookingServiceLabel)}</span>` : `<span class="pill booking-card-category">${categoryLabel}</span>`}
            </div>
            <div class="booking-card-meta-row">
              <span>${bookingDateLabel}</span>
              <span>${bookingTimeLabel}</span>
              <span>${bookingTotalLabel}</span>
              <span>${escapeHtml(getBookingLocationLabel(booking))}</span>
            </div>
          </div>
        </div>
      </a>
      <div class="booking-card-side">
        <div class="booking-card-status-group">
          <span class="pill ${getStatusClassName(booking.status)}">${bookingStatusLabel}</span>
          <span class="booking-card-status-note">${supportCopy}</span>
        </div>
        <div class="booking-card-actions">
          <a class="${actionClass}" href="${getBookingDetailHref(booking)}">${actionLabel}</a>
          ${canCancel ? `<button class="ghost-button" type="button" data-booking-action="cancel" data-booking-id="${booking.id}">Cancel</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

export function initBookingsView(actions) {
  if (!elements.bookingHistoryPanel || !elements.pendingBookingsList || !elements.recentBookingsList || !elements.recentBookingsShell) {
    return;
  }

  const hasPlanner =
    Boolean(
      elements.bookingEmpty &&
        elements.availabilityForm &&
        elements.bookingForm &&
        elements.bookingRoomSelect &&
        elements.bookingDateInput &&
        elements.bookingStartSelect &&
        elements.bookingDurationSelect,
    );

  if (hasPlanner) {
    elements.bookingDateInput.value = todayString();

    elements.bookingRoomSelect?.addEventListener("change", () => {
      selectedStaffIds = new Set();
      clearBookingPromoState(getBookingPromoInputValue() ? "Room changed. Apply promo again to refresh the total." : "");
      setState({ availability: null });
      if (elements.bookingStartSelect) {
        elements.bookingStartSelect.innerHTML = "";
      }
      if (elements.bookingDurationSelect) {
        elements.bookingDurationSelect.innerHTML = "";
      }
      if (elements.bookingSlotList) {
        elements.bookingSlotList.innerHTML = "";
        elements.bookingSlotList.classList.add("hidden");
      }
      renderStaffOptions(state);
      renderBookingPromoFeedback();
      renderBookingSummary(state);
    });

    elements.availabilityForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const roomId = elements.bookingRoomSelect.value;
      const date = elements.bookingDateInput.value;

      if (!roomId || !date) {
        setState({ message: "Choose a room and date first." });
        return;
      }

      try {
        setState({ message: "Loading availability..." });
        const availability = await api.getAvailability(roomId, date);
        setState({ availability, message: "Availability loaded." });
      } catch (error) {
        elements.bookingStartSelect.innerHTML = "";
        elements.bookingDurationSelect.innerHTML = "";
        selectedStaffIds = new Set();
        renderStaffOptions(state);
        if (elements.bookingSlotList) {
          elements.bookingSlotList.innerHTML = "";
        }
        setState({ availability: null, message: error.message });
      }
    });

    elements.bookingStartSelect.addEventListener("change", () => {
      renderDurationOptions();
      renderSlotList(state);
      renderBookingSummary(state);
    });

    elements.bookingDurationSelect.addEventListener("change", () => {
      const selectedRoom = getSelectedRoom();
      invalidateBookingPromoIfNeeded(selectedRoom, getSelectedDuration());
      renderBookingPromoFeedback();
      renderBookingSummary(state);
    });

    elements.bookingStaffOptions?.addEventListener("change", (event) => {
      const input = event.target.closest("input[type='checkbox']");
      if (!input) {
        return;
      }

      if (input.checked) {
        selectedStaffIds.add(input.value);
      } else {
        selectedStaffIds.delete(input.value);
      }
      const selectedRoom = getSelectedRoom();
      invalidateBookingPromoIfNeeded(selectedRoom, getSelectedDuration());
      renderBookingPromoFeedback();
      renderBookingSummary(state);
    });

    document.getElementById("booking-promo-preview-button")?.addEventListener("click", async () => {
      await applyBookingPromoPreview(state);
    });

    getBookingPromoCodeInput()?.addEventListener("input", () => {
      if (!getBookingPromoInputValue()) {
        clearBookingPromoState("");
        renderBookingPromoFeedback();
        renderBookingSummary(state);
        return;
      }

      if (bookingPromoPreview && bookingPromoPreview.code !== getBookingPromoInputValue()) {
        clearBookingPromoState("Promo code changed. Apply again to refresh the total.");
        renderBookingPromoFeedback();
        renderBookingSummary(state);
      }
    });

    if (elements.bookingSlotList) {
      elements.bookingSlotList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-slot-start]");
        if (!button) {
          return;
        }
        elements.bookingStartSelect.value = button.dataset.slotStart;
        renderDurationOptions();
        renderSlotList(state);
        renderBookingSummary(state);
      });
    }

    elements.bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const roomId = elements.bookingRoomSelect.value;
      const startTime = elements.bookingStartSelect.value;
      const duration = Number(elements.bookingDurationSelect.value);

      if (!roomId || !startTime || !duration) {
        setState({ message: "Load availability and choose a valid slot first." });
        return;
      }

      try {
        setState({ message: "Creating booking..." });
        const payload = {
          room_id: roomId,
          start_time: startTime,
          duration_minutes: duration,
          promo_code: getBookingPromoInputValue() || null,
          note: elements.bookingNoteInput?.value?.trim() || null,
          staff_assignments: [...selectedStaffIds],
        };
        let booking = null;
        if (state.currentUser) {
          booking = await api.createBooking(payload);
        } else {
          const guestName = getBookingGuestNameInput()?.value?.trim() || "";
          const guestPhone = getBookingGuestPhoneInput()?.value?.trim() || "";
          if (!guestName || !guestPhone) {
            setState({ message: "Enter your name and phone number to continue as guest." });
            return;
          }
          const guestSession = await api.createGuestBooking({
            ...payload,
            guest_name: guestName,
            guest_phone: guestPhone,
          });
          booking = guestSession.booking;
          persistToken(guestSession.access_token);
        }
        if (elements.bookingNoteInput) {
          elements.bookingNoteInput.value = "";
        }
        if (getBookingGuestNameInput()) {
          getBookingGuestNameInput().value = "";
        }
        if (getBookingGuestPhoneInput()) {
          getBookingGuestPhoneInput().value = "";
        }
        if (getBookingPromoCodeInput()) {
          getBookingPromoCodeInput().value = "";
        }
        clearBookingPromoState("");
        selectedStaffIds = new Set();
        persistLastBookingId(booking.id);
        persistCheckoutDraft({ booking });
        window.location.href = `/booking?id=${booking.id}`;
      } catch (error) {
        setState({ message: error.message });
      }
    });
  }

  elements.bookingHistoryPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-booking-action='cancel']");
    if (!button) {
      return;
    }

    const booking = state.bookings.find((item) => String(item.id) === String(button.dataset.bookingId));
    const bookingKind = getBookingKind(booking);

    try {
      const confirmed = window.confirm("Are you sure you want to cancel this booking?");
      if (!confirmed) {
        return;
      }
      setState({ message: "Cancelling booking..." });
      if (bookingKind === "staff") {
        await api.cancelStaffBooking(button.dataset.bookingId, { reason: "Cancelled by user" });
      } else {
        await api.cancelBooking(button.dataset.bookingId, { reason: "Cancelled by user" });
      }
      await actions.refreshAvailabilityAndBookings("Booking cancelled.");
    } catch (error) {
      setState({ message: error.message });
    }
  });

  elements.bookingHistoryAllTab?.addEventListener("click", () => {
    bookingHistoryKind = "all";
    renderBookingsView(state);
  });
  elements.bookingHistoryRoomsTab?.addEventListener("click", () => {
    bookingHistoryKind = "rooms";
    renderBookingsView(state);
  });
  elements.bookingHistoryStaffTab?.addEventListener("click", () => {
    bookingHistoryKind = "staff";
    renderBookingsView(state);
  });

  const upcomingTab = document.getElementById("booking-history-upcoming-tab");
  const historyTab = document.getElementById("booking-history-history-tab");

  upcomingTab?.addEventListener("click", () => {
    bookingHistoryTab = "upcoming";
    renderBookingsView(state);
  });

  historyTab?.addEventListener("click", () => {
    bookingHistoryTab = "history";
    renderBookingsView(state);
  });
}

export function renderBookingsView(currentState) {
  if (!elements.pendingBookingsList || !elements.recentBookingsList || !elements.recentBookingsShell) {
    return;
  }

  const hasPlanner =
    Boolean(
      elements.bookingEmpty &&
        elements.availabilityForm &&
        elements.bookingForm &&
        elements.bookingRoomSelect &&
        elements.bookingDateInput &&
        elements.bookingStartSelect &&
        elements.bookingDurationSelect,
    );
  const isSignedIn = Boolean(currentState.currentUser);
  if (hasPlanner) {
    elements.bookingEmpty.classList.toggle("hidden", isSignedIn);
    elements.availabilityForm.classList.remove("hidden");
    elements.bookingForm.classList.remove("hidden");
    elements.availabilitySummary.classList.toggle("hidden", !currentState.availability);

    const existingRoomId = elements.bookingRoomSelect.value;
    const roomOptions = currentState.rooms
      .filter((room) => room.active)
      .map((room) => `<option value="${room.id}">${room.name}</option>`);
    elements.bookingRoomSelect.innerHTML = roomOptions.length
      ? roomOptions.join("")
      : '<option value="">No active rooms available</option>';
    if (roomOptions.length && currentState.rooms.some((room) => room.id === existingRoomId && room.active)) {
      elements.bookingRoomSelect.value = existingRoomId;
    }
    applyRequestedRoomSelection(currentState);

    if (!elements.bookingDateInput.value) {
      elements.bookingDateInput.value = todayString();
    }

    renderStartTimeOptions(currentState);
    renderAvailabilitySummary();
    renderSlotList(currentState);
    renderStaffOptions(currentState);
    invalidateBookingPromoIfNeeded(getSelectedRoom(), getSelectedDuration());
    renderBookingPromoFeedback();
    renderBookingSummary(currentState);

    const bookingSubmitButton = elements.bookingForm.querySelector("button[type='submit']");
    if (bookingSubmitButton) {
      bookingSubmitButton.disabled = !elements.bookingStartSelect?.value;
      bookingSubmitButton.textContent = isSignedIn ? "Save 5-minute spot hold" : "Continue as guest";
    }
    getBookingGuestFields()?.classList.toggle("hidden", isSignedIn);
  }

  const filteredBookings = getFilteredBookingCollection(currentState.bookings);
  const bookingCounts = getFilteredBookingCounts(currentState.bookings);
  const upcomingBookings = getUpcomingBookings(filteredBookings);
  const historyBookings = getHistoryBookings(filteredBookings);

  if (elements.bookingHistoryAllCount) {
    elements.bookingHistoryAllCount.textContent = String(bookingCounts.all);
  }
  if (elements.bookingHistoryRoomsCount) {
    elements.bookingHistoryRoomsCount.textContent = String(bookingCounts.rooms);
  }
  if (elements.bookingHistoryStaffCount) {
    elements.bookingHistoryStaffCount.textContent = String(bookingCounts.staff);
  }
  if (elements.pendingBookingsCount) {
    elements.pendingBookingsCount.classList.toggle("hidden", upcomingBookings.length === 0);
    elements.pendingBookingsCount.textContent = upcomingBookings.length ? formatBookingCount(upcomingBookings.length) : "";
  }

  if (elements.recentBookingsCount) {
    elements.recentBookingsCount.textContent = formatBookingCount(historyBookings.length);
  }

  const upcomingTab = document.getElementById("booking-history-upcoming-tab");
  const historyTab = document.getElementById("booking-history-history-tab");
  const allTypeTab = elements.bookingHistoryAllTab;
  const roomTypeTab = elements.bookingHistoryRoomsTab;
  const staffTypeTab = elements.bookingHistoryStaffTab;
  const upcomingPanel = document.getElementById("booking-history-upcoming-panel");
  const historyPanel = document.getElementById("booking-history-history-panel");
  const upcomingTabCount = document.getElementById("booking-history-upcoming-count");
  const historyTabCount = document.getElementById("booking-history-history-count");

  if (upcomingTabCount) {
    upcomingTabCount.textContent = String(upcomingBookings.length);
  }
  if (historyTabCount) {
    historyTabCount.textContent = String(historyBookings.length);
  }

  allTypeTab?.classList.toggle("is-active", bookingHistoryKind === "all");
  roomTypeTab?.classList.toggle("is-active", bookingHistoryKind === "rooms");
  staffTypeTab?.classList.toggle("is-active", bookingHistoryKind === "staff");
  allTypeTab?.setAttribute("aria-selected", bookingHistoryKind === "all" ? "true" : "false");
  roomTypeTab?.setAttribute("aria-selected", bookingHistoryKind === "rooms" ? "true" : "false");
  staffTypeTab?.setAttribute("aria-selected", bookingHistoryKind === "staff" ? "true" : "false");

  const upcomingViewActive = bookingHistoryTab !== "history";
  upcomingTab?.classList.toggle("is-active", upcomingViewActive);
  historyTab?.classList.toggle("is-active", !upcomingViewActive);
  upcomingTab?.setAttribute("aria-selected", upcomingViewActive ? "true" : "false");
  historyTab?.setAttribute("aria-selected", upcomingViewActive ? "false" : "true");
  upcomingPanel?.classList.toggle("hidden", !upcomingViewActive);
  historyPanel?.classList.toggle("hidden", upcomingViewActive);

  if (elements.recentBookingsShell) {
    elements.recentBookingsShell.classList.remove("hidden");
  }

  elements.pendingBookingsList.innerHTML = renderBookingCollection(upcomingBookings, getBookingsEmptyMessage("upcoming"), {
    upcoming: true,
  });
  elements.recentBookingsList.innerHTML = renderBookingCollection(historyBookings, getBookingsEmptyMessage("history"));
}
