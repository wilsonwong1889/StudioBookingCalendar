import { api } from "../api.js?v=20260427a";
import { elements, toggleHidden } from "../dom.js?v=20260427a";
import { persistCheckoutDraft, persistLastBookingId, persistToken, setState, state } from "../state.js?v=20260427a";
const ROOM_CATEGORY_VISUALS = {
  recording: "/assets/media/studio-room-2.png",
  podcast: "/assets/media/studio-lobby-2.png",
  production: "/assets/media/studio-room-2.png",
  photography: "/assets/media/studio-room-2.png",
  dance: "/assets/media/studio-exterior-2.png",
  film: "/assets/media/studio-exterior-2.png",
};

const MIN_DURATION_MINUTES = 60;
const MAX_DURATION_MINUTES = 300;

let selectedDate = null;
let displayedMonth = null;
let dayAvailability = null;
let selectedStart = "";
let lastRoomId = null;
let monthAvailability = {};
let loadingDay = false;
let loadingMonth = false;
let selectedStaffIds = new Set();
let reservePromoPreview = null;
let reservePromoMessage = "";

function getReserveGuestFields() {
  return document.getElementById("reserve-guest-fields");
}

function getReserveGuestNameInput() {
  return document.getElementById("reserve-guest-name");
}

function getReserveGuestPhoneInput() {
  return document.getElementById("reserve-guest-phone");
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format((cents || 0) / 100);
}

function formatDateLabel(value) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes) {
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function buildAmenityList(room) {
  const amenities = [];
  if ((room.capacity || 0) >= 4) {
    amenities.push("High-Speed WiFi");
  }
  if ((room.staff_roles || []).length) {
    amenities.push("Pro Monitors");
  }
  if ((room.photos || []).length > 1) {
    amenities.push("Premium Mics");
  }
  amenities.push("Central Location");
  return amenities.slice(0, 4);
}

function getRoomCategory(room) {
  const text = `${room.name || ""} ${room.description || ""}`.toLowerCase();
  if (text.includes("podcast")) {
    return "podcast";
  }
  if (text.includes("production")) {
    return "production";
  }
  if (text.includes("photo")) {
    return "photography";
  }
  if (text.includes("dance")) {
    return "dance";
  }
  if (text.includes("film") || text.includes("video")) {
    return "film";
  }
  return "recording";
}

function getReserveGallery(room) {
  const rawPhotos = Array.isArray(room.photos) ? room.photos : [];
  const usablePhotos = rawPhotos.filter((photo) => photo && !String(photo).includes("/assets/media/rooms/"));
  if (usablePhotos.length) {
    return usablePhotos;
  }

  const category = getRoomCategory(room);
  const fallback = ROOM_CATEGORY_VISUALS[category] || "/assets/media/studio-room-2.png";
  if (category === "podcast") {
    return [
      "/assets/media/studio-lobby-2.png",
      "/assets/media/studio-exterior-2.png",
      "/assets/media/studio-room-2.png",
    ];
  }
  return [
    fallback,
    "/assets/media/studio-lobby-2.png",
    "/assets/media/studio-exterior-2.png",
  ];
}

function buildDurationValues(limitMinutes = MAX_DURATION_MINUTES) {
  const safeLimit = Math.max(MIN_DURATION_MINUTES, Math.min(limitMinutes, MAX_DURATION_MINUTES));
  const values = [];
  for (let duration = MIN_DURATION_MINUTES; duration <= safeLimit; duration += MIN_DURATION_MINUTES) {
    values.push(duration);
  }
  return values;
}

function getReservePromoCodeInput() {
  return document.getElementById("reserve-promo-code-input");
}

function getReservePromoFeedback() {
  return document.getElementById("reserve-promo-feedback");
}

function getReservePromoInputValue() {
  return getReservePromoCodeInput()?.value?.trim()?.toUpperCase() || "";
}

function getReservePromoSelectionKey(roomId, durationMinutes, amountCents) {
  return JSON.stringify({
    roomId: String(roomId || ""),
    durationMinutes: Number(durationMinutes || 0),
    amountCents: Number(amountCents || 0),
    staffIds: [...selectedStaffIds].sort(),
  });
}

function getReservePromoContext(room) {
  if (!room) {
    return null;
  }

  const amountCents = calculateEstimatedTotal(room);
  return {
    amountCents,
    selectionKey: getReservePromoSelectionKey(room.id, getSelectedDurationMinutes(), amountCents),
  };
}

function clearReservePromoState(message = "") {
  reservePromoPreview = null;
  reservePromoMessage = message;
}

function invalidateReservePromoIfNeeded(room) {
  if (!reservePromoPreview || !room) {
    return;
  }

  const context = getReservePromoContext(room);
  if (!context || reservePromoPreview.selectionKey !== context.selectionKey) {
    clearReservePromoState("Selection changed. Apply promo again to refresh the total.");
  }
}

function renderReservePromoFeedback() {
  const feedback = getReservePromoFeedback();
  if (!feedback) {
    return;
  }

  if (reservePromoPreview) {
    feedback.classList.remove("hidden");
    feedback.className = "empty-state booking-promo-feedback booking-promo-feedback-success";
    feedback.innerHTML = `
      <strong>${reservePromoPreview.code} applied</strong>
      <span>Discount ${formatCurrency(reservePromoPreview.discount_cents)}. New estimated total ${formatCurrency(reservePromoPreview.final_amount_cents)}.</span>
    `;
    return;
  }

  if (reservePromoMessage) {
    feedback.classList.remove("hidden");
    feedback.className = "empty-state booking-promo-feedback booking-promo-feedback-error";
    feedback.innerHTML = `<strong>Promo update</strong><span>${reservePromoMessage}</span>`;
    return;
  }

  feedback.className = "empty-state booking-promo-feedback hidden";
  feedback.innerHTML = "";
}

async function applyReservePromoPreview(currentState) {
  const room = currentState.selectedRoom;
  const code = getReservePromoInputValue();
  const context = getReservePromoContext(room);

  if (!room || !context) {
    clearReservePromoState("Choose a room and duration before applying a promo code.");
    renderReservePromoFeedback();
    renderSummary(currentState);
    return;
  }

  if (!code) {
    clearReservePromoState("Enter a promo code first.");
    renderReservePromoFeedback();
    renderSummary(currentState);
    return;
  }

  try {
    setState({ message: "Checking promo code..." });
    const preview = await api.previewPromoCode(code, context.amountCents);
    reservePromoPreview = {
      ...preview,
      selectionKey: context.selectionKey,
    };
    reservePromoMessage = "";
    setState({ message: `${preview.code} applied.` });
  } catch (error) {
    clearReservePromoState(error.message);
    setState({ message: error.message });
  }

  renderReservePromoFeedback();
  renderSummary(currentState);
}

function getSelectedDurationMinutes() {
  return Number(elements.reserveDurationSelect?.value || MIN_DURATION_MINUTES);
}

function renderStaffImage(photoUrl, label) {
  if (photoUrl) {
    return `<img class="staff-avatar" src="${photoUrl}" alt="${label}" loading="lazy" />`;
  }
  return `<div class="staff-avatar staff-avatar-fallback">${label.slice(0, 1).toUpperCase()}</div>`;
}

function renderRoomVisuals(room) {
  if (elements.reserveRoomPhotos) {
    const photos = getReserveGallery(room);
    elements.reserveRoomPhotos.innerHTML = photos.length
      ? photos
          .map(
            (photo, index) => `
              <figure class="${index === 0 ? "room-detail-hero-media reserve-detail-hero-media" : "room-detail-thumb-card reserve-detail-thumb-card"}">
                <img class="detail-image" src="${photo}" alt="${room.name} image ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" />
                ${index === 0 ? "" : `<figcaption>Image ${index + 1}</figcaption>`}
              </figure>
            `,
          )
          .join("")
      : '<div class="empty-state">No room images were added for this room yet.</div>';
  }

  if (elements.reserveRoomMeta) {
    elements.reserveRoomMeta.innerHTML = `
      <span class="pill reserve-room-pill">${room.name.split(" ")[0]}</span>
      <span class="pill reserve-room-pill ${room.active ? "" : "muted"}">${room.active ? "Available" : "Inactive"}</span>
      <span class="pill reserve-room-pill">Up to ${room.capacity || "n/a"} people</span>
      <span class="pill reserve-room-pill">★ 4.9 rating</span>
      <span class="pill reserve-room-pill">Min 1 hour</span>
    `;
  }

  if (elements.reserveRoomAmenities) {
    elements.reserveRoomAmenities.innerHTML = buildAmenityList(room)
      .map((item) => `<span class="room-detail-amenity">${item}</span>`)
      .join("");
  }
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

function daysInMonth(monthValue) {
  const base = new Date(`${monthValue}T00:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function getSelectedStaffOptions(room) {
  const roles = room?.staff_roles || [];
  return roles.filter((role) => selectedStaffIds.has(role.id));
}

function calculateEstimatedTotal(room) {
  const baseRate = (room?.hourly_rate_cents || 0) * (getSelectedDurationMinutes() / 60);
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

async function loadDayAvailability(roomId, date) {
  if (!roomId || !date) {
    return;
  }

  loadingDay = true;
  renderRoomBookingView(state);
  try {
    const availability = await api.getAvailability(roomId, date);
    dayAvailability = availability;
    const starts = availability.available_start_times || [];
    if (!starts.includes(selectedStart)) {
      selectedStart = starts[0] || "";
    }
    setState({ message: "Day availability loaded." });
  } catch (error) {
    dayAvailability = null;
    selectedStart = "";
    setState({ message: error.message });
  } finally {
    loadingDay = false;
    renderRoomBookingView(state);
  }
}

async function loadMonthAvailability(roomId, monthValue) {
  if (!roomId || !monthValue) {
    return;
  }

  loadingMonth = true;
  renderRoomBookingView(state);
  try {
    const totalDays = daysInMonth(monthValue);
    const entries = await Promise.all(
      Array.from({ length: totalDays }, async (_value, index) => {
        const date = new Date(`${monthValue}T00:00:00`);
        date.setDate(index + 1);
        const isoDate = date.toISOString().slice(0, 10);
        const availability = await api.getAvailability(roomId, isoDate);
        return [isoDate, availability.available_start_times.length];
      }),
    );
    monthAvailability = Object.fromEntries(entries);
    setState({ message: "Month calendar loaded." });
  } catch (error) {
    monthAvailability = {};
    setState({ message: error.message });
  } finally {
    loadingMonth = false;
    renderRoomBookingView(state);
  }
}

function renderDaySummary(currentState) {
  if (!elements.reserveAvailabilitySummary) {
    return;
  }

  if (!currentState.selectedRoom || !selectedDate) {
    elements.reserveAvailabilitySummary.innerHTML = `
      <strong>Select a room and date</strong>
      <span>Load a day to see its available start times.</span>
    `;
    return;
  }

  if (loadingDay) {
    elements.reserveAvailabilitySummary.innerHTML = `
      <strong>Loading times...</strong>
      <span>Checking ${formatDateLabel(selectedDate)} for ${currentState.selectedRoom.name}.</span>
    `;
    return;
  }

  if (!dayAvailability) {
    elements.reserveAvailabilitySummary.innerHTML = `
      <strong>Availability unavailable</strong>
      <span>Try another day.</span>
    `;
    return;
  }

  const count = dayAvailability.available_start_times.length;
  elements.reserveAvailabilitySummary.innerHTML = count
    ? `
      <strong>${count} start times available</strong>
      <span>${currentState.selectedRoom.name} on ${dayAvailability.date} in ${dayAvailability.timezone}.</span>
    `
    : `
      <strong>No openings found</strong>
      <span>${currentState.selectedRoom.name} is fully booked on ${dayAvailability.date}.</span>
    `;
}

function renderSlotList() {
  if (!elements.reserveSlotList || !elements.reserveStartSelect || !elements.reserveDurationSelect) {
    return;
  }

  const starts = dayAvailability?.available_start_times || [];
  elements.reserveStartSelect.innerHTML = starts
    .map((startTime) => `<option value="${startTime}">${formatDateTime(startTime)}</option>`)
    .join("");

  if (starts.includes(selectedStart)) {
    elements.reserveStartSelect.value = selectedStart;
  } else {
    elements.reserveStartSelect.value = starts[0] || "";
    selectedStart = elements.reserveStartSelect.value;
  }

  const maxDuration = dayAvailability?.max_duration_minutes_by_start?.[selectedStart];
  const previousValue = getSelectedDurationMinutes();
  const allowedDurations = buildDurationValues(maxDuration || MAX_DURATION_MINUTES);
  elements.reserveDurationSelect.innerHTML = allowedDurations
    .map((duration) => `<option value="${duration}">${formatDuration(duration)}</option>`)
    .join("");
  elements.reserveDurationSelect.value = allowedDurations.includes(previousValue)
    ? String(previousValue)
    : String(MIN_DURATION_MINUTES);

  if (!starts.length) {
    toggleHidden(elements.reserveSlotList, true);
    elements.reserveSlotList.innerHTML = "";
    return;
  }

  toggleHidden(elements.reserveSlotList, false);
  elements.reserveSlotList.innerHTML = starts
    .map(
      (startTime) => `
        <button class="slot-card ${startTime === selectedStart ? "is-selected" : ""}" type="button" data-reserve-slot="${startTime}">
          <strong>${formatTime(startTime)}</strong>
          <span>Up to ${formatDuration(Math.min(dayAvailability.max_duration_minutes_by_start[startTime], MAX_DURATION_MINUTES))}</span>
        </button>
      `,
    )
    .join("");
}

function renderStaffOptions(currentState) {
  if (!elements.reserveStaffSection || !elements.reserveStaffOptions) {
    return;
  }

  const room = currentState.selectedRoom;
  const staffRoles = room?.staff_roles || [];
  if (!staffRoles.length) {
    selectedStaffIds = new Set();
    toggleHidden(elements.reserveStaffSection, true);
    elements.reserveStaffOptions.innerHTML = "";
    return;
  }

  const availableIds = new Set(staffRoles.map((role) => role.id));
  selectedStaffIds = new Set([...selectedStaffIds].filter((roleId) => availableIds.has(roleId)));

  toggleHidden(elements.reserveStaffSection, false);
  elements.reserveStaffOptions.innerHTML = staffRoles
    .map(
      (role) => `
        <label class="staff-option-card">
          <div class="staff-option-toggle">
            <input type="checkbox" value="${role.id}" ${selectedStaffIds.has(role.id) ? "checked" : ""} />
          </div>
          ${renderStaffImage(role.photo_url, role.name)}
          <div class="staff-option-copy">
            <strong>${role.name}</strong>
            <span>${role.description || "Optional staff support for this session."}</span>
            ${renderTagGroup("Skills", role.skills || [])}
            ${renderTagGroup("Talents", role.talents || [])}
          </div>
          <strong class="staff-option-price">${formatCurrency(role.add_on_price_cents)}</strong>
        </label>
      `,
    )
    .join("");
}

function renderSummary(currentState) {
  if (!elements.reserveSummaryMeta) {
    return;
  }

  const room = currentState.selectedRoom;
  if (!room) {
    elements.reserveSummaryMeta.innerHTML = '<div class="empty-state">Choose a room from the catalog first.</div>';
    return;
  }

  const estimatedTotal = calculateEstimatedTotal(room);
  const promoSelectionKey = getReservePromoSelectionKey(room.id, getSelectedDurationMinutes(), estimatedTotal);
  const activePromo =
    reservePromoPreview &&
    reservePromoPreview.selectionKey === promoSelectionKey &&
    reservePromoPreview.code === getReservePromoInputValue()
      ? reservePromoPreview
      : null;

  if (!selectedStart) {
    elements.reserveSummaryMeta.innerHTML = `
      <div class="reserve-price-line"><span>${formatCurrency(room.hourly_rate_cents)} x ${formatDuration(getSelectedDurationMinutes())}</span><strong>${formatCurrency(estimatedTotal)}</strong></div>
      <div class="reserve-price-line"><span>Service fee</span><strong class="reserve-price-free">Free</strong></div>
      ${
        activePromo
          ? `<div class="reserve-price-line"><span>Promo ${activePromo.code}</span><strong>-${formatCurrency(activePromo.discount_cents)}</strong></div>`
          : ""
      }
      <div class="reserve-price-total"><span>Total</span><strong>${formatCurrency(activePromo ? activePromo.final_amount_cents : estimatedTotal)}</strong></div>
      <div class="reserve-helper-copy reserve-helper-copy-strong">Pick an available time to continue.</div>
    `;
    return;
  }

  elements.reserveSummaryMeta.innerHTML = `
    <div class="reserve-price-line"><span>${formatCurrency(room.hourly_rate_cents)} x ${formatDuration(getSelectedDurationMinutes())}</span><strong>${formatCurrency(estimatedTotal)}</strong></div>
    <div class="reserve-price-line"><span>Service fee</span><strong class="reserve-price-free">Free</strong></div>
    ${
      activePromo
        ? `<div class="reserve-price-line"><span>Promo ${activePromo.code}</span><strong>-${formatCurrency(activePromo.discount_cents)}</strong></div>`
        : ""
    }
    ${renderSelectedStaffBreakdown(room)
      .replaceAll('class="summary-line"', 'class="reserve-price-line reserve-price-line-staff"')}
    <div class="reserve-price-total"><span>Total</span><strong>${formatCurrency(activePromo ? activePromo.final_amount_cents : estimatedTotal)}</strong></div>
    <div class="reserve-helper-copy reserve-helper-copy-strong">${formatDateTime(selectedStart)}</div>
  `;
}

function renderSubmitButton(currentState) {
  if (!elements.reserveSubmitButton) {
    return;
  }

  if (!currentState.selectedRoom) {
    elements.reserveSubmitButton.disabled = true;
    elements.reserveSubmitButton.textContent = "Save 5-minute spot hold";
    return;
  }

  const canSubmit = Boolean(selectedStart && elements.reserveDurationSelect?.value);
  const estimatedTotal = calculateEstimatedTotal(currentState.selectedRoom);
  const promoSelectionKey = getReservePromoSelectionKey(
    currentState.selectedRoom.id,
    getSelectedDurationMinutes(),
    estimatedTotal,
  );
  const activePromo =
    reservePromoPreview &&
    reservePromoPreview.selectionKey === promoSelectionKey &&
    reservePromoPreview.code === getReservePromoInputValue()
      ? reservePromoPreview
      : null;
  const totalLabel = formatCurrency(activePromo ? activePromo.final_amount_cents : estimatedTotal);
  elements.reserveSubmitButton.disabled = !canSubmit;
  elements.reserveSubmitButton.textContent = canSubmit
    ? `Confirm Booking ${totalLabel}`
    : currentState.currentUser
      ? "Choose a time to continue"
      : "Choose a time to continue";
}

function renderCalendar() {
  if (!elements.reserveMonthGrid || !elements.reserveCalendarTitle || !displayedMonth) {
    return;
  }

  const monthDate = new Date(`${displayedMonth}T00:00:00`);
  elements.reserveCalendarTitle.textContent = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const firstDay = new Date(`${displayedMonth}T00:00:00`);
  const startOffset = firstDay.getDay();
  const totalDays = daysInMonth(displayedMonth);
  const cells = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push('<div class="calendar-cell calendar-cell-empty"></div>');
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(`${displayedMonth}T00:00:00`);
    date.setDate(day);
    const isoDate = date.toISOString().slice(0, 10);
    const count = monthAvailability[isoDate];
    const isSelected = isoDate === selectedDate;
    const label = loadingMonth && count === undefined ? "..." : `${count || 0} slots`;
    cells.push(`
      <button
        class="calendar-cell ${isSelected ? "is-selected" : ""} ${count ? "is-open" : "is-closed"}"
        type="button"
        data-reserve-date="${isoDate}"
      >
        <strong>${day}</strong>
        <span>${label}</span>
      </button>
    `);
  }

  elements.reserveMonthGrid.innerHTML = cells.join("");
}

async function selectDate(roomId, date) {
  selectedDate = date;
  if (elements.reserveDateInput) {
    elements.reserveDateInput.value = date;
  }
  renderRoomBookingView(state);
  await loadDayAvailability(roomId, date);
}

export function initRoomBookingView() {
  if (!elements.reserveBookingForm || !elements.reserveMonthGrid) {
    return;
  }

  elements.reserveDateButton?.addEventListener("click", async () => {
    if (!state.selectedRoom || !elements.reserveDateInput.value) {
      return;
    }
    await selectDate(String(state.selectedRoom.id), elements.reserveDateInput.value);
  });

  elements.reserveStartSelect?.addEventListener("change", () => {
    selectedStart = elements.reserveStartSelect.value;
    renderSlotList();
    renderSummary(state);
    renderSubmitButton(state);
  });

  elements.reserveDurationSelect?.addEventListener("change", () => {
    invalidateReservePromoIfNeeded(state.selectedRoom);
    renderReservePromoFeedback();
    renderSummary(state);
    renderSubmitButton(state);
    updateDurationDisplay();
  });

  elements.reserveDurationDecrease?.addEventListener("click", () => {
    if (!elements.reserveDurationSelect) {
      return;
    }
    const values = Array.from(elements.reserveDurationSelect.options).map((option) => Number(option.value));
    const current = getSelectedDurationMinutes();
    const next = values.filter((value) => value < current).pop();
    if (!next) {
      return;
    }
    elements.reserveDurationSelect.value = String(next);
    invalidateReservePromoIfNeeded(state.selectedRoom);
    renderReservePromoFeedback();
    renderSummary(state);
    renderSubmitButton(state);
    updateDurationDisplay();
  });

  elements.reserveDurationIncrease?.addEventListener("click", () => {
    if (!elements.reserveDurationSelect) {
      return;
    }
    const values = Array.from(elements.reserveDurationSelect.options).map((option) => Number(option.value));
    const current = getSelectedDurationMinutes();
    const next = values.find((value) => value > current);
    if (!next) {
      return;
    }
    elements.reserveDurationSelect.value = String(next);
    invalidateReservePromoIfNeeded(state.selectedRoom);
    renderReservePromoFeedback();
    renderSummary(state);
    renderSubmitButton(state);
    updateDurationDisplay();
  });

  elements.reserveSlotList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reserve-slot]");
    if (!button || !elements.reserveStartSelect) {
      return;
    }
    selectedStart = button.dataset.reserveSlot;
    elements.reserveStartSelect.value = selectedStart;
    renderSlotList();
    renderSummary(state);
    renderSubmitButton(state);
  });

  elements.reserveMonthGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-reserve-date]");
    if (!button || !state.selectedRoom) {
      return;
    }
    await selectDate(String(state.selectedRoom.id), button.dataset.reserveDate);
  });

  elements.reservePrevMonth?.addEventListener("click", async () => {
    if (!state.selectedRoom || !displayedMonth) {
      return;
    }
    const date = new Date(`${displayedMonth}T00:00:00`);
    date.setMonth(date.getMonth() - 1);
    displayedMonth = `${date.toISOString().slice(0, 7)}-01`;
    renderCalendar();
    await loadMonthAvailability(String(state.selectedRoom.id), displayedMonth);
  });

  elements.reserveNextMonth?.addEventListener("click", async () => {
    if (!state.selectedRoom || !displayedMonth) {
      return;
    }
    const date = new Date(`${displayedMonth}T00:00:00`);
    date.setMonth(date.getMonth() + 1);
    displayedMonth = `${date.toISOString().slice(0, 7)}-01`;
    renderCalendar();
    await loadMonthAvailability(String(state.selectedRoom.id), displayedMonth);
  });

  elements.reserveStaffOptions?.addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox']");
    if (!input) {
      return;
    }

    if (input.checked) {
      selectedStaffIds.add(input.value);
    } else {
      selectedStaffIds.delete(input.value);
    }
    invalidateReservePromoIfNeeded(state.selectedRoom);
    renderReservePromoFeedback();
    renderSummary(state);
    renderSubmitButton(state);
  });

  document.getElementById("reserve-promo-preview-button")?.addEventListener("click", async () => {
    await applyReservePromoPreview(state);
  });

  getReservePromoCodeInput()?.addEventListener("input", () => {
    if (!getReservePromoInputValue()) {
      clearReservePromoState("");
      renderReservePromoFeedback();
      renderSummary(state);
      return;
    }

    if (reservePromoPreview && reservePromoPreview.code !== getReservePromoInputValue()) {
      clearReservePromoState("Promo code changed. Apply again to refresh the total.");
      renderReservePromoFeedback();
      renderSummary(state);
    }
  });

  elements.reserveBookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedRoom || !selectedStart || !elements.reserveDurationSelect.value) {
      setState({ message: "Choose a valid day, slot, and duration first." });
      return;
    }

    try {
      setState({ message: "Creating booking..." });
      const payload = {
        room_id: state.selectedRoom.id,
        start_time: selectedStart,
        duration_minutes: getSelectedDurationMinutes(),
        promo_code: getReservePromoInputValue() || null,
        note: elements.reserveNoteInput?.value?.trim() || null,
        staff_assignments: [...selectedStaffIds],
      };
      let booking = null;
      if (state.currentUser) {
        booking = await api.createBooking(payload);
      } else {
        const guestName = getReserveGuestNameInput()?.value?.trim() || "";
        const guestPhone = getReserveGuestPhoneInput()?.value?.trim() || "";
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
      if (elements.reserveNoteInput) {
        elements.reserveNoteInput.value = "";
      }
      if (getReserveGuestNameInput()) {
        getReserveGuestNameInput().value = "";
      }
      if (getReserveGuestPhoneInput()) {
        getReserveGuestPhoneInput().value = "";
      }
      if (getReservePromoCodeInput()) {
        getReservePromoCodeInput().value = "";
      }
      clearReservePromoState("");
      await loadDayAvailability(String(state.selectedRoom.id), selectedDate);
      await loadMonthAvailability(String(state.selectedRoom.id), displayedMonth);
      persistLastBookingId(booking.id);
      persistCheckoutDraft({ booking });
      window.location.href = `/booking?id=${booking.id}`;
    } catch (error) {
      setState({ message: error.message });
    }
  });
}

function updateDurationDisplay() {
  if (!elements.reserveDurationDisplay || !elements.reserveDurationUnit) {
    return;
  }
  const hours = getSelectedDurationMinutes() / 60;
  elements.reserveDurationDisplay.textContent = String(hours);
  elements.reserveDurationUnit.textContent = hours === 1 ? "hour" : "hours";
}

export function renderRoomBookingView(currentState) {
  if (!elements.reserveEmpty || !elements.reservePlannerPanel || !elements.reserveCalendarPanel) {
    return;
  }

  const room = currentState.selectedRoom;
  const hasRoom = Boolean(room);
  toggleHidden(elements.reserveEmpty, hasRoom);
  toggleHidden(elements.reservePlannerPanel, !hasRoom);
  toggleHidden(elements.reserveSummaryPanel, !hasRoom);
  toggleHidden(elements.reserveCalendarPanel, !hasRoom);

  if (!room) {
    return;
  }

  if (String(room.id) !== lastRoomId) {
    lastRoomId = String(room.id);
    selectedDate = todayString();
    displayedMonth = firstOfMonth(selectedDate);
    dayAvailability = null;
    monthAvailability = {};
    selectedStart = "";
    selectedStaffIds = new Set();
    clearReservePromoState("");
    if (elements.reserveDateInput) {
      elements.reserveDateInput.value = selectedDate;
    }
    if (elements.reserveNoteInput) {
      elements.reserveNoteInput.value = "";
    }
    if (elements.reserveStartSelect) {
      elements.reserveStartSelect.innerHTML = "";
    }
    void loadDayAvailability(lastRoomId, selectedDate);
    void loadMonthAvailability(lastRoomId, displayedMonth);
  }

  renderRoomVisuals(room);
  if (elements.reserveRoomTitle) {
    elements.reserveRoomTitle.textContent = room.name;
  }
  getReserveGuestFields()?.classList.toggle("hidden", Boolean(currentState.currentUser));
  if (elements.reserveRoomCopy) {
    const bookingPrompt = currentState.currentUser
      ? "Choose a day, pick a start time, and confirm your booking."
      : "Choose a day, pick a start time, and continue with your name and phone number.";
    elements.reserveRoomCopy.textContent = `${room.description || "Review available times for this room."} ${bookingPrompt}`;
  }

  if (elements.reserveDateInput && selectedDate && elements.reserveDateInput.value !== selectedDate) {
    elements.reserveDateInput.value = selectedDate;
  }

  renderDaySummary(currentState);
  renderSlotList();
  renderStaffOptions(currentState);
  invalidateReservePromoIfNeeded(currentState.selectedRoom);
  renderReservePromoFeedback();
  renderSummary(currentState);
  renderCalendar();
  renderSubmitButton(currentState);
  updateDurationDisplay();
}
