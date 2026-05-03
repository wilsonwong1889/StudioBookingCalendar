import { API_BASE_URL, getSearchParam } from "../config.js?v=20260422d";
import { elements } from "../dom.js?v=20260427a";
import {
  persistCheckoutDraft,
  persistLastBookingId,
  persistToken,
  setState,
  state,
} from "../state.js?v=20260427a";

const STAFF_PLACEHOLDER_IMAGE = "/assets/media/staff/staff-placeholder.svg";

const FOUNDERS = [
  {
    name: "Studio Founder",
    role: "Founder / Creative Lead",
    summary: "Add the founder biography here so visitors understand the studio origin, style, and mission.",
  },
  {
    name: "Co-Founder",
    role: "Founder / Business Lead",
    summary: "Use this slot for the business, operations, or production founder behind the space.",
  },
];

let staffProfilesCache = [];
let selectedStaffId = getSearchParam("staff_id") || "";
let selectedDate = new Date().toISOString().slice(0, 10);
let selectedTime = "";
let selectedDuration = 60;
let selectedAvailability = null;
let loadingAvailability = false;
let lastAvailabilityKey = "";
let viewBound = false;

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format((Number(cents) || 0) / 100);
}

function formatDateLabel(value) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTimeLabel(value) {
  if (!value) {
    return "";
  }

  if (String(value).includes("T")) {
    return new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  const normalized = String(value).padStart(5, "0");
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`1970-01-01T${normalized}:00`));
}

function formatDuration(minutes) {
  const hours = Number(minutes || 0) / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderFounderCard(founder) {
  return `
    <article class="staff-profile-card staff-profile-card-founder">
      <div class="staff-profile-card-top">
        <img
          class="staff-profile-image"
          src="${STAFF_PLACEHOLDER_IMAGE}"
          alt="${escapeHtml(founder.name)}"
          loading="lazy"
        />
        <div class="staff-option-copy">
          <strong>${escapeHtml(founder.name)}</strong>
          <span>${escapeHtml(founder.role)}</span>
        </div>
      </div>
      <p>${escapeHtml(founder.summary)}</p>
    </article>
  `;
}

function renderStaffImage(photoUrl, label) {
  const source = photoUrl || STAFF_PLACEHOLDER_IMAGE;
  return `<img class="staff-profile-image" src="${escapeHtml(source)}" alt="${escapeHtml(label)}" loading="lazy" />`;
}

function renderTagGroup(label, values = []) {
  if (!values.length) {
    return "";
  }

  return `
    <div class="staff-tag-group">
      <span>${escapeHtml(label)}</span>
      <div class="preview-pill-row">
        ${values.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join("")}
      </div>
    </div>
  `;
}

function getStaffRateCents(profile) {
  return Number(
    profile?.booking_rate_cents ??
    profile?.hourly_rate_cents ??
    profile?.session_rate_cents ??
    profile?.add_on_price_cents ??
    0,
  );
}

function getStaffRateLabel(profile) {
  const rate = getStaffRateCents(profile);
  return rate ? `${formatCurrency(rate)} / hr` : "Rate on request";
}

function getSelectedStaffProfile() {
  return staffProfilesCache.find((profile) => String(profile.id) === String(selectedStaffId)) || null;
}

function getStaffServiceOptions(profile) {
  const values = new Set(
    (profile?.service_types || []).length
      ? profile.service_types
      : ["Creative session", "Recording support", "Podcast support", "Production help", "Consultation"],
  );
  (profile?.skills || []).slice(0, 3).forEach((value) => values.add(value));
  (profile?.talents || []).slice(0, 3).forEach((value) => values.add(value));
  return Array.from(values);
}

function parseAvailabilitySlots(payload) {
  const rawSlots =
    payload?.available_start_times ||
    payload?.available_slots ||
    payload?.slots ||
    payload?.times ||
    [];

  return rawSlots
    .map((slot) => {
      if (typeof slot === "string") {
        return { value: slot, label: formatTimeLabel(slot), available: true };
      }

      const value = slot.value || slot.start_time || slot.start || slot.time || "";
      if (!value) {
        return null;
      }

      return {
        value,
        label: slot.label || slot.text || formatTimeLabel(value),
        available: slot.available !== false,
        maxDurationMinutes: slot.max_duration_minutes || slot.maxDurationMinutes || null,
      };
    })
    .filter(Boolean);
}

function buildTimeValue(slotValue) {
  if (!slotValue) {
    return "";
  }

  if (String(slotValue).includes("T")) {
    return slotValue;
  }

  const normalized = String(slotValue).length === 5 ? `${slotValue}:00` : String(slotValue);
  return new Date(`${selectedDate}T${normalized}`).toISOString();
}

function getTimeGrid() {
  return document.getElementById("staff-booking-time-grid");
}

function getSelectedCard() {
  return document.getElementById("staff-booking-selected-card");
}

function getAvailabilitySummary() {
  return document.getElementById("staff-booking-availability");
}

function getBookingStatus() {
  return document.getElementById("staff-booking-status");
}

function getSummaryCard() {
  return document.getElementById("staff-booking-summary-card");
}

function getSummaryDate() {
  return document.getElementById("staff-booking-summary-date");
}

function getSummaryTime() {
  return document.getElementById("staff-booking-summary-time");
}

function getSummaryDuration() {
  return document.getElementById("staff-booking-summary-duration");
}

function getSummaryTotal() {
  return document.getElementById("staff-booking-summary-total");
}

function getSubmitButton() {
  return document.getElementById("staff-booking-submit");
}

function getBookingDateInput() {
  return document.getElementById("staff-booking-date");
}

function getBookingDurationSelect() {
  return document.getElementById("staff-booking-duration");
}

function getBookingServiceSelect() {
  return document.getElementById("staff-booking-service");
}

function getBookingNameInput() {
  return document.getElementById("staff-booking-name");
}

function getBookingPhoneInput() {
  return document.getElementById("staff-booking-phone");
}

function getBookingEmailInput() {
  return document.getElementById("staff-booking-email");
}

function getBookingNotesInput() {
  return document.getElementById("staff-booking-notes");
}

function getBookingShell() {
  return document.getElementById("staff-booking-shell");
}

function buildRequestHeaders(hasBody = false) {
  const headers = new Headers();
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildRequestHeaders(Boolean(options.body)),
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof data === "object" && data !== null && "detail" in data ? data.detail : "Request failed";
    throw new Error(detail);
  }

  return data;
}

function setStatus(message, isError = false) {
  const status = getBookingStatus();
  if (status) {
    status.textContent = message;
    status.classList.toggle("staff-booking-status-error", Boolean(isError));
  }
  setState({ message });
}

function syncSelectionUrl(staffId) {
  const url = new URL(window.location.href);
  if (staffId) {
    url.searchParams.set("staff_id", staffId);
    url.hash = "staff-booking-shell";
  } else {
    url.searchParams.delete("staff_id");
  }
  window.history.replaceState({}, "", url.toString());
}

function renderSelectedCard(profile) {
  const target = getSelectedCard();
  if (!target) {
    return;
  }

  if (!profile) {
    target.className = "staff-booking-selected-card empty-state";
    target.innerHTML = "Select a staff member above to start booking.";
    return;
  }

  const rate = getStaffRateLabel(profile);
  const skills = (profile.skills || []).slice(0, 3);
  const talents = (profile.talents || []).slice(0, 3);
  target.className = "staff-booking-selected-card";
  target.innerHTML = `
    <div class="staff-profile-card-top">
      ${renderStaffImage(profile.photo_url, profile.name)}
      <div class="staff-option-copy">
        <strong>${escapeHtml(profile.name)}</strong>
        <span>${escapeHtml(profile.description || "Staff booking support.")}</span>
      </div>
    </div>
    <div class="room-meta">
      <span class="pill">${escapeHtml(rate)}</span>
      <span class="pill">Book staff</span>
    </div>
    ${renderTagGroup("Skills", skills)}
    ${renderTagGroup("Talents", talents)}
  `;
}

function renderSummaryCard(profile) {
  const target = getSummaryCard();
  if (!target) {
    return;
  }

  if (!profile) {
    target.className = "staff-booking-summary-card empty-state";
    target.innerHTML = "Choose a staff member to see their summary here.";
    return;
  }

  target.className = "staff-booking-summary-card";
  target.innerHTML = `
    <div class="staff-booking-summary-top">
      ${renderStaffImage(profile.photo_url, profile.name)}
      <div class="staff-option-copy">
        <strong>${escapeHtml(profile.name)}</strong>
        <span>${escapeHtml(profile.description || "Public staff profile.")}</span>
      </div>
    </div>
    <div class="room-meta">
      <span class="pill">${escapeHtml(getStaffRateLabel(profile))}</span>
      <span class="pill">${escapeHtml((profile.skills || []).slice(0, 1)[0] || "Book staff")}</span>
    </div>
  `;
}

function renderServiceOptions(profile) {
  const select = getBookingServiceSelect();
  if (!select) {
    return;
  }

  const options = getStaffServiceOptions(profile);
  select.innerHTML = options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
  if (!options.includes(select.value)) {
    select.value = options[0] || "Creative session";
  }
}

function renderAvailability(profile) {
  const target = getTimeGrid();
  const summary = getAvailabilitySummary();
  const currentDate = getBookingDateInput()?.value || selectedDate;

  if (!target || !summary) {
    return;
  }

  if (!profile) {
    target.innerHTML = "";
    summary.className = "empty-state staff-booking-availability";
    summary.innerHTML = "Pick a staff member and date to see openings.";
    return;
  }

  if (loadingAvailability) {
    summary.className = "empty-state staff-booking-availability";
    summary.innerHTML = `Loading openings for ${formatDateLabel(currentDate)}...`;
    target.innerHTML = "";
    return;
  }

  const slots = Array.isArray(selectedAvailability?.slots) ? selectedAvailability.slots : [];
  if (!slots.length) {
    target.innerHTML = "";
    summary.className = "empty-state staff-booking-availability";
    summary.innerHTML = `No openings were returned for ${formatDateLabel(currentDate)}.`;
    return;
  }

  summary.className = "empty-state staff-booking-availability";
  summary.innerHTML = `<strong>${slots.length} opening${slots.length === 1 ? "" : "s"} on ${formatDateLabel(currentDate)}</strong>`;
  target.innerHTML = slots
    .map((slot) => {
      const selected = selectedTime === slot.value;
      const disabled = slot.available === false ? "disabled" : "";
      return `
        <button
          class="slot-card ${selected ? "is-selected" : ""}"
          type="button"
          data-staff-time="${escapeHtml(slot.value)}"
          ${disabled}
        >
          <strong>${escapeHtml(slot.label || formatTimeLabel(slot.value))}</strong>
          <span>${slot.maxDurationMinutes ? `Up to ${formatDuration(slot.maxDurationMinutes)}` : "Tap to select"}</span>
        </button>
      `;
    })
    .join("");
}

function renderSummary(profile) {
  const dateNode = getSummaryDate();
  const timeNode = getSummaryTime();
  const durationNode = getSummaryDuration();
  const totalNode = getSummaryTotal();
  const submitButton = getSubmitButton();
  const formReady = Boolean(profile && selectedTime && selectedDate);
  const durationMinutes = Number(getBookingDurationSelect()?.value || selectedDuration || 60);
  const rateCents = profile ? getStaffRateCents(profile) : 0;
  const estimatedTotal = Math.round((rateCents * durationMinutes) / 60);

  if (dateNode) {
    dateNode.textContent = selectedDate ? formatDateLabel(selectedDate) : "Select a date";
  }
  if (timeNode) {
    timeNode.textContent = selectedTime ? formatTimeLabel(selectedTime) : "Choose an opening";
  }
  if (durationNode) {
    durationNode.textContent = formatDuration(durationMinutes);
  }
  if (totalNode) {
    totalNode.textContent = formatCurrency(estimatedTotal);
  }
  if (submitButton) {
    submitButton.disabled = !formReady;
    submitButton.textContent = formReady ? `Confirm booking ${formatCurrency(estimatedTotal)}` : "Confirm booking";
  }
}

function fillSignedInFields(currentState) {
  if (!currentState.currentUser) {
    return;
  }

  const nameInput = getBookingNameInput();
  const emailInput = getBookingEmailInput();
  const phoneInput = getBookingPhoneInput();
  if (nameInput && !nameInput.value) {
    nameInput.value = currentState.currentUser.full_name || currentState.currentUser.name || "";
  }
  if (emailInput && !emailInput.value) {
    emailInput.value = currentState.currentUser.email || "";
  }
  if (phoneInput && !phoneInput.value) {
    phoneInput.value = currentState.currentUser.phone || currentState.currentUser.phone_number || "";
  }
}

function renderStaffBookingShell(currentState) {
  const profile = getSelectedStaffProfile();
  const shell = getBookingShell();
  const dateInput = getBookingDateInput();
  const durationSelect = getBookingDurationSelect();

  if (!shell) {
    return;
  }

  shell.classList.toggle("is-ready", Boolean(profile));
  renderSelectedCard(profile);
  renderSummaryCard(profile);

  if (dateInput) {
    if (dateInput.value !== selectedDate) {
      dateInput.value = selectedDate;
    }
  }
  if (durationSelect && durationSelect.value !== String(selectedDuration)) {
    durationSelect.value = String(selectedDuration);
  }

  if (profile) {
    renderServiceOptions(profile);
    fillSignedInFields(currentState);
    if (!selectedTime) {
      const firstSlot = Array.isArray(selectedAvailability?.slots) ? selectedAvailability.slots.find((slot) => slot.available !== false) : null;
      if (firstSlot) {
        selectedTime = firstSlot.value;
      }
    }
  }

  renderAvailability(profile);
  renderSummary(profile);

  const status = getBookingStatus();
  if (status) {
    if (profile) {
      const rate = getStaffRateLabel(profile);
      status.textContent = `Selected ${profile.name}. ${rate} starting rate. Choose a time to continue.`;
      status.classList.remove("staff-booking-status-error");
    } else {
      status.textContent = "Select a staff member above to start a booking.";
      status.classList.remove("staff-booking-status-error");
    }
  }
}

async function loadAvailabilityForSelectedStaff() {
  const profile = getSelectedStaffProfile();
  if (!profile) {
    selectedAvailability = null;
    renderStaffBookingShell({ currentUser: state.currentUser });
    return;
  }

  const requestKey = `${profile.id}:${selectedDate}`;
  if (lastAvailabilityKey === requestKey && selectedAvailability) {
    renderStaffBookingShell({ currentUser: state.currentUser });
    return;
  }

  lastAvailabilityKey = requestKey;
  loadingAvailability = true;
  setStatus(`Loading openings for ${profile.name}...`);
  renderStaffBookingShell({ currentUser: state.currentUser });

  try {
    const payload = await request(`/api/staff/${profile.id}/availability?date=${selectedDate}`);
    selectedAvailability = {
      ...payload,
      slots: parseAvailabilitySlots(payload),
    };
    if (!selectedTime) {
      selectedTime = selectedAvailability.slots.find((slot) => slot.available !== false)?.value || "";
    }
    setStatus(`Openings loaded for ${profile.name}.`);
  } catch (error) {
    selectedAvailability = { slots: [] };
    selectedTime = "";
    setStatus(error.message, true);
  } finally {
    loadingAvailability = false;
    renderStaffBookingShell({ currentUser: state.currentUser });
  }
}

async function selectStaffBooking(staffId, { syncUrl = true, scroll = true } = {}) {
  const nextId = String(staffId || "");
  if (!nextId) {
    return;
  }

  selectedStaffId = nextId;
  selectedTime = "";
  selectedAvailability = null;
  lastAvailabilityKey = "";
  if (syncUrl) {
    syncSelectionUrl(nextId);
  }
  setStatus("Staff selected. Loading availability...");
  renderStaffBookingShell({ currentUser: state.currentUser });
  if (scroll) {
    getBookingShell()?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  await loadAvailabilityForSelectedStaff();
}

function handleTeamGridClick(event) {
  const button = event.target.closest("[data-staff-book-button]");
  if (!button) {
    return;
  }

  event.preventDefault();
  void selectStaffBooking(button.dataset.staffBookButton);
}

function handleTimeGridClick(event) {
  const button = event.target.closest("[data-staff-time]");
  if (!button) {
    return;
  }

  selectedTime = button.dataset.staffTime || "";
  renderStaffBookingShell({ currentUser: state.currentUser });
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const profile = getSelectedStaffProfile();
  if (!profile) {
    setStatus("Select a staff member first.", true);
    return;
  }

  const name = getBookingNameInput()?.value.trim() || "";
  const phone = getBookingPhoneInput()?.value.trim() || "";
  const email = getBookingEmailInput()?.value.trim() || "";
  const notes = getBookingNotesInput()?.value.trim() || "";
  const durationMinutes = Number(getBookingDurationSelect()?.value || selectedDuration || 60);
  const serviceType = getBookingServiceSelect()?.value || profile.skills?.[0] || "Creative session";

  if (!selectedTime) {
    setStatus("Choose an available time first.", true);
    return;
  }
  if (!name || !phone) {
    setStatus("Enter your name and phone number to continue.", true);
    return;
  }

  const payload = {
    staff_profile_id: profile.id,
    service_type: serviceType,
    start_time: buildTimeValue(selectedTime),
    duration_minutes: durationMinutes,
    guest_name: name,
    guest_phone: phone,
    guest_email: email || null,
    notes: notes || null,
  };

  try {
    setStatus("Creating staff booking...");
    const endpoint = state.token ? "/api/staff-bookings" : "/api/staff-bookings/guest";
    const response = await request(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const booking = response.booking || response;
    const bookingId = booking.id || booking.booking_id || booking.uuid;

    if (!bookingId) {
      throw new Error("The booking service returned no booking id.");
    }

    if (response.access_token) {
      persistToken(response.access_token);
    }

    persistLastBookingId(bookingId);
    persistCheckoutDraft({
      kind: "staff",
      booking,
      staff_profile_id: profile.id,
      staff_profile_name: profile.name,
      selected_date: selectedDate,
      selected_start_time: selectedTime,
      duration_minutes: durationMinutes,
      service_type: serviceType,
      payment_client_secret: response.payment_client_secret || booking.payment_client_secret || null,
    });

    setStatus("Booking created. Redirecting to checkout...");
    window.location.href = `/booking?id=${bookingId}&kind=staff`;
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderStaffCard(profile) {
  const rate = getStaffRateLabel(profile);
  const skills = (profile.skills || []).slice(0, 3);
  const talents = (profile.talents || []).slice(0, 3);
  const isSelected = String(profile.id) === String(selectedStaffId);
  return `
    <article class="staff-profile-card staff-bookable-card ${isSelected ? "is-selected" : ""}" data-staff-id="${escapeHtml(profile.id)}">
      <div class="staff-profile-card-top">
        ${renderStaffImage(profile.photo_url, profile.name)}
        <div class="staff-option-copy">
          <strong>${escapeHtml(profile.name)}</strong>
          <span>${escapeHtml(profile.description || "Studio staff profile.")}</span>
        </div>
      </div>
      <div class="room-meta staff-card-rate-row">
        <span class="pill">${escapeHtml(rate)}</span>
        <span class="pill">Book staff</span>
      </div>
      ${renderTagGroup("Skills", skills)}
      ${renderTagGroup("Talents", talents)}
      <div class="staff-profile-card-actions">
        <button class="primary-button staff-book-button" type="button" data-staff-book-button="${escapeHtml(profile.id)}">
          Book staff
        </button>
      </div>
    </article>
  `;
}

export function initStaffDirectoryView() {
  if (viewBound) {
    return;
  }

  viewBound = true;

  elements.staffTeamGrid?.addEventListener("click", handleTeamGridClick);
  getTimeGrid()?.addEventListener("click", handleTimeGridClick);
  getBookingDateInput()?.addEventListener("change", async (event) => {
    selectedDate = event.target.value || selectedDate;
    selectedAvailability = null;
    selectedTime = "";
    lastAvailabilityKey = "";
    renderStaffBookingShell({ currentUser: state.currentUser });
    await loadAvailabilityForSelectedStaff();
  });
  getBookingDurationSelect()?.addEventListener("change", () => {
    selectedDuration = Number(getBookingDurationSelect()?.value || 60);
    renderStaffBookingShell({ currentUser: state.currentUser });
  });
  getBookingServiceSelect()?.addEventListener("change", () => {
    renderStaffBookingShell({ currentUser: state.currentUser });
  });
  getBookingForm()?.addEventListener("submit", handleBookingSubmit);

  const initialProfileId = selectedStaffId;
  if (initialProfileId && staffProfilesCache.some((profile) => String(profile.id) === String(initialProfileId))) {
    void selectStaffBooking(initialProfileId, { syncUrl: false, scroll: false });
  }
}

function getBookingForm() {
  return document.getElementById("staff-booking-form");
}

function renderBookingSection(currentState) {
  const profile = getSelectedStaffProfile();
  const paramStaffId = getSearchParam("staff_id");

  if (!selectedStaffId && paramStaffId && currentState.publicStaffProfiles?.some((item) => String(item.id) === String(paramStaffId))) {
    selectedStaffId = String(paramStaffId);
    lastAvailabilityKey = "";
  }

  if (selectedStaffId && !profile && currentState.publicStaffProfiles?.length) {
    const exists = currentState.publicStaffProfiles.some((item) => String(item.id) === String(selectedStaffId));
    if (!exists) {
      selectedStaffId = "";
      selectedAvailability = null;
      selectedTime = "";
      lastAvailabilityKey = "";
    }
  }

  if (profile && !selectedAvailability && !loadingAvailability) {
    void loadAvailabilityForSelectedStaff();
  }

  renderStaffBookingShell(currentState);
}

export function renderStaffDirectoryView(currentState) {
  staffProfilesCache = currentState.publicStaffProfiles || [];

  if (elements.staffFoundersGrid) {
    elements.staffFoundersGrid.innerHTML = FOUNDERS.map(renderFounderCard).join("");
  }

  if (elements.staffTeamGrid) {
    const profiles = staffProfilesCache.filter((profile) => profile?.active !== false);
    elements.staffTeamGrid.innerHTML = profiles.length
      ? profiles.map(renderStaffCard).join("")
      : '<div class="empty-state">No public staff profiles yet. Add active staff profiles in admin to show them here.</div>';
  }

  if (selectedStaffId && !staffProfilesCache.some((profile) => String(profile.id) === String(selectedStaffId))) {
    selectedStaffId = "";
    selectedAvailability = null;
    selectedTime = "";
    lastAvailabilityKey = "";
  }

  if (!viewBound) {
    initStaffDirectoryView();
  }

  renderBookingSection(currentState);
}
