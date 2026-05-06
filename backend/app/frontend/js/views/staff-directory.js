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
let selectedDate = todayString();
let selectedTime = "";
let selectedDuration = 60;
let selectedAvailability = null;
let loadingAvailability = false;
let lastAvailabilityKey = "";
let availabilityRequestToken = 0;
let viewBound = false;
let staffSearchQuery = "";
let staffCategoryFilter = "all";
let staffSortMode = "recommended";

const STAFF_DURATION_OPTIONS = [60, 120, 180, 240, 300];

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function getStaffRating(profile) {
  const seed = String(profile?.id || profile?.name || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 4.6 + (seed % 4) / 10;
}

function getStaffPrimaryCategory(profile) {
  return (
    (profile?.skills || []).find(Boolean) ||
    (profile?.talents || []).find(Boolean) ||
    (profile?.service_types || []).find(Boolean) ||
    "Creative"
  );
}

function getStaffSearchText(profile) {
  return [
    profile?.name,
    profile?.description,
    getStaffPrimaryCategory(profile),
    ...(profile?.skills || []),
    ...(profile?.talents || []),
    ...(profile?.service_types || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
  const durationMap = payload?.max_duration_minutes_by_start || {};

  return rawSlots
    .map((slot) => {
      if (typeof slot === "string") {
        return {
          value: slot,
          label: formatTimeLabel(slot),
          available: true,
          maxDurationMinutes: durationMap[slot] || null,
        };
      }

      const value = slot.value || slot.start_time || slot.start || slot.time || "";
      if (!value) {
        return null;
      }

      return {
        value,
        label: slot.label || slot.text || formatTimeLabel(value),
        available: slot.available !== false,
        maxDurationMinutes: slot.max_duration_minutes || slot.maxDurationMinutes || durationMap[value] || null,
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

function getStaffSearchInput() {
  return document.getElementById("staff-search-text");
}

function getStaffCategoryBar() {
  return document.getElementById("staff-category-bar");
}

function getStaffResultsCount() {
  return document.getElementById("staff-results-count");
}

function getStaffFilterToggle() {
  return document.getElementById("staff-filter-toggle");
}

function getStaffFilterPanel() {
  return document.getElementById("staff-filter-panel");
}

function getStaffSortSelect() {
  return document.getElementById("staff-sort-select");
}

function getStaffStepList() {
  return document.getElementById("staff-booking-step-list");
}

function getDurationDecreaseButton() {
  return document.getElementById("staff-booking-duration-decrease");
}

function getDurationIncreaseButton() {
  return document.getElementById("staff-booking-duration-increase");
}

function getDurationDisplay() {
  return document.getElementById("staff-booking-duration-display");
}

function getDurationUnit() {
  return document.getElementById("staff-booking-duration-unit");
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

function getStaffCategories(profiles) {
  const counts = new Map();
  profiles.forEach((profile) => {
    const values = [...(profile.skills || []), ...(profile.talents || []), ...(profile.service_types || [])]
      .filter(Boolean)
      .slice(0, 5);
    values.forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([value]) => value);
}

function renderStaffCategoryBar(profiles) {
  const target = getStaffCategoryBar();
  if (!target) {
    return;
  }

  const categories = getStaffCategories(profiles);
  target.innerHTML = [
    `<button class="tab-button ${staffCategoryFilter === "all" ? "is-active" : ""}" type="button" data-staff-category="all">All</button>`,
    ...categories.map(
      (category) => `
        <button class="tab-button ${staffCategoryFilter === category ? "is-active" : ""}" type="button" data-staff-category="${escapeHtml(category)}">
          ${escapeHtml(category)}
        </button>
      `,
    ),
  ].join("");
}

function getVisibleStaffProfiles(profiles) {
  const query = staffSearchQuery.trim().toLowerCase();
  const filtered = profiles.filter((profile) => {
    const matchesQuery = !query || getStaffSearchText(profile).includes(query);
    const matchesCategory =
      staffCategoryFilter === "all" ||
      [...(profile.skills || []), ...(profile.talents || []), ...(profile.service_types || [])].includes(staffCategoryFilter);
    return matchesQuery && matchesCategory;
  });

  return filtered.sort((left, right) => {
    if (staffSortMode === "rate-low") {
      return getStaffRateCents(left) - getStaffRateCents(right);
    }
    if (staffSortMode === "rate-high") {
      return getStaffRateCents(right) - getStaffRateCents(left);
    }
    if (staffSortMode === "name") {
      return String(left.name || "").localeCompare(String(right.name || ""));
    }
    return getStaffRating(right) - getStaffRating(left);
  });
}

function renderSelectedCard(profile) {
  const target = getSelectedCard();
  if (!target) {
    return;
  }

  if (!profile) {
    target.className = "staff-booking-selected-card empty-state";
    target.innerHTML = "Choose staff from the catalog to load a booking workspace.";
    return;
  }

  const rate = getStaffRateLabel(profile);
  const skills = (profile.skills || []).slice(0, 3);
  const talents = (profile.talents || []).slice(0, 3);
  target.className = "staff-booking-selected-card staff-reserve-profile-card";
  target.innerHTML = `
    <div class="staff-reserve-profile-media">
      ${renderStaffImage(profile.photo_url, profile.name)}
    </div>
    <div class="staff-reserve-profile-copy">
      <div class="room-meta">
        <span class="pill reserve-room-pill">${escapeHtml(rate)}</span>
        <span class="pill reserve-room-pill">${escapeHtml(getStaffPrimaryCategory(profile))}</span>
        <span class="pill reserve-room-pill">Bookable now</span>
      </div>
      <h2>${escapeHtml(profile.name)}</h2>
      <p>${escapeHtml(profile.description || "Staff booking support.")}</p>
      <div class="staff-reserve-profile-tags">
        ${renderTagGroup("Skills", skills)}
        ${renderTagGroup("Talents", talents)}
      </div>
    </div>
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
      <span class="pill">${escapeHtml(getStaffPrimaryCategory(profile))}</span>
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

function getSelectedSlot() {
  const slots = Array.isArray(selectedAvailability?.slots) ? selectedAvailability.slots : [];
  return slots.find((slot) => String(slot.value) === String(selectedTime)) || null;
}

function availabilityMatchesSelection(profile) {
  if (!profile || !selectedAvailability) {
    return false;
  }

  const availabilityDate = selectedAvailability.date ? String(selectedAvailability.date) : selectedDate;
  const availabilityStaffId = selectedAvailability.staff_profile_id
    ? String(selectedAvailability.staff_profile_id)
    : String(profile.id);
  return availabilityDate === selectedDate && availabilityStaffId === String(profile.id);
}

function getSlotMaxDuration(slot) {
  const maxDuration = Number(slot?.maxDurationMinutes || 300);
  return Number.isFinite(maxDuration) && maxDuration >= 60 ? Math.min(maxDuration, 300) : 0;
}

function getAllowedStaffDurations() {
  const selectedSlot = getSelectedSlot();
  if (!selectedSlot || selectedSlot.available === false) {
    return [60];
  }

  const maxDuration = getSlotMaxDuration(selectedSlot);
  return STAFF_DURATION_OPTIONS.filter((minutes) => minutes <= maxDuration);
}

function getSelectedDurationMinutes() {
  const allowedDurations = getAllowedStaffDurations();
  if (!allowedDurations.includes(Number(selectedDuration))) {
    selectedDuration = allowedDurations[0] || 60;
  }
  return selectedDuration;
}

function syncDurationControls() {
  const durationSelect = getBookingDurationSelect();
  const display = getDurationDisplay();
  const unit = getDurationUnit();
  const decreaseButton = getDurationDecreaseButton();
  const increaseButton = getDurationIncreaseButton();
  const allowedDurations = getAllowedStaffDurations();
  const durationMinutes = getSelectedDurationMinutes();
  const currentIndex = allowedDurations.indexOf(durationMinutes);
  const hasActiveSlot = Boolean(getSelectedSlot() && !loadingAvailability);

  if (durationSelect) {
    durationSelect.innerHTML = allowedDurations
      .map((minutes) => `<option value="${minutes}">${formatDuration(minutes)}</option>`)
      .join("");
    durationSelect.value = String(durationMinutes);
    durationSelect.disabled = !hasActiveSlot;
  }
  if (display) {
    display.textContent = String(durationMinutes / 60);
  }
  if (unit) {
    unit.textContent = durationMinutes === 60 ? "hour" : "hours";
  }
  if (decreaseButton) {
    decreaseButton.disabled = !hasActiveSlot || currentIndex <= 0;
  }
  if (increaseButton) {
    increaseButton.disabled = !hasActiveSlot || currentIndex < 0 || currentIndex >= allowedDurations.length - 1;
  }
}

function getStaffSelectionValidity(profile) {
  const selectedSlot = getSelectedSlot();
  const durationMinutes = getSelectedDurationMinutes();
  const maxDuration = getSlotMaxDuration(selectedSlot);
  const valid = Boolean(
    profile &&
      !loadingAvailability &&
      availabilityMatchesSelection(profile) &&
      selectedSlot &&
      selectedSlot.available !== false &&
      durationMinutes >= 60 &&
      durationMinutes <= maxDuration,
  );

  return {
    valid,
    selectedSlot,
    durationMinutes,
    maxDuration,
  };
}

function hasContactDetails() {
  return Boolean(getBookingNameInput()?.value.trim() && getBookingPhoneInput()?.value.trim());
}

function renderStaffBookingSteps(profile) {
  const stepList = getStaffStepList();
  if (!stepList) {
    return;
  }

  const hasStaff = Boolean(profile);
  const hasTime = getStaffSelectionValidity(profile).valid;
  const hasDetails = Boolean(hasTime && hasContactDetails());
  const activeStep = !hasStaff ? "staff" : !hasTime ? "time" : !hasDetails ? "details" : "checkout";
  const completeSteps = {
    staff: hasStaff,
    time: hasTime,
    details: hasDetails,
    checkout: hasDetails,
  };

  stepList.querySelectorAll("[data-staff-step]").forEach((step) => {
    const key = step.dataset.staffStep;
    step.classList.toggle("is-active", key === activeStep);
    step.classList.toggle("is-complete", Boolean(completeSteps[key]) && key !== activeStep);
  });
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
    summary.className = "reserve-helper-copy staff-booking-availability";
    summary.innerHTML = "Pick a staff member and date to see openings.";
    return;
  }

  if (loadingAvailability) {
    summary.className = "reserve-helper-copy staff-booking-availability";
    summary.innerHTML = `Loading openings for ${formatDateLabel(currentDate)}...`;
    target.innerHTML = "";
    return;
  }

  const slots = availabilityMatchesSelection(profile) && Array.isArray(selectedAvailability?.slots) ? selectedAvailability.slots : [];
  if (!slots.length) {
    target.innerHTML = "";
    summary.className = "reserve-helper-copy staff-booking-availability";
    summary.innerHTML = `No openings were returned for ${formatDateLabel(currentDate)}.`;
    return;
  }

  summary.className = "reserve-helper-copy staff-booking-availability reserve-helper-copy-strong";
  summary.innerHTML = `${slots.length} opening${slots.length === 1 ? "" : "s"} on ${formatDateLabel(currentDate)}`;
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
  const selection = getStaffSelectionValidity(profile);
  const formReady = Boolean(selection.valid && selectedDate && hasContactDetails());
  const durationMinutes = selection.durationMinutes;
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
    submitButton.textContent = formReady ? `Continue to checkout ${formatCurrency(estimatedTotal)}` : "Continue to checkout";
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
      const firstSlot =
        availabilityMatchesSelection(profile) && Array.isArray(selectedAvailability?.slots)
          ? selectedAvailability.slots.find((slot) => slot.available !== false)
          : null;
      if (firstSlot) {
        selectedTime = firstSlot.value;
      }
    }
  }

  renderAvailability(profile);
  syncDurationControls();
  renderSummary(profile);
  renderStaffBookingSteps(profile);

  const status = getBookingStatus();
  if (status) {
    if (profile) {
      const rate = getStaffRateLabel(profile);
      status.textContent = selectedTime
        ? hasContactDetails()
          ? `Ready for checkout with ${profile.name}.`
          : "Enter your name and phone number to continue."
        : `Selected ${profile.name}. ${rate} starting rate. Choose a time to continue.`;
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
    availabilityRequestToken += 1;
    selectedAvailability = null;
    selectedTime = "";
    renderStaffBookingShell({ currentUser: state.currentUser });
    return;
  }

  const staffId = String(profile.id);
  const targetDate = selectedDate;
  const requestKey = `${staffId}:${targetDate}`;
  if (lastAvailabilityKey === requestKey && selectedAvailability) {
    renderStaffBookingShell({ currentUser: state.currentUser });
    return;
  }

  const requestToken = availabilityRequestToken + 1;
  availabilityRequestToken = requestToken;
  lastAvailabilityKey = requestKey;
  loadingAvailability = true;
  selectedAvailability = null;
  selectedTime = "";
  setStatus(`Loading openings for ${profile.name}...`);
  renderStaffBookingShell({ currentUser: state.currentUser });

  try {
    const payload = await request(`/api/staff/${staffId}/availability?date=${targetDate}`);
    if (
      requestToken !== availabilityRequestToken ||
      lastAvailabilityKey !== requestKey ||
      selectedDate !== targetDate ||
      String(selectedStaffId) !== staffId
    ) {
      return;
    }

    selectedAvailability = {
      ...payload,
      slots: parseAvailabilitySlots(payload),
    };
    selectedTime = selectedAvailability.slots.find((slot) => slot.available !== false)?.value || "";
    getSelectedDurationMinutes();
    setStatus(`Openings loaded for ${profile.name}.`);
  } catch (error) {
    if (requestToken !== availabilityRequestToken) {
      return;
    }

    selectedAvailability = { slots: [] };
    selectedTime = "";
    setStatus(error.message, true);
  } finally {
    if (requestToken === availabilityRequestToken) {
      loadingAvailability = false;
      renderStaffBookingShell({ currentUser: state.currentUser });
    }
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
  const selection = getStaffSelectionValidity(profile);
  const durationMinutes = selection.durationMinutes;
  const serviceType = getBookingServiceSelect()?.value || profile.skills?.[0] || "Creative session";

  if (!selection.valid) {
    setStatus("Choose an available time first.", true);
    renderStaffBookingShell({ currentUser: state.currentUser });
    return;
  }
  if (!name || !phone) {
    setStatus("Enter your name and phone number to continue.", true);
    return;
  }

  const payload = {
    staff_profile_id: profile.id,
    service_type: serviceType,
    start_time: buildTimeValue(selection.selectedSlot.value),
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
  const isSelected = String(profile.id) === String(selectedStaffId);
  const category = getStaffPrimaryCategory(profile);
  const rating = getStaffRating(profile);
  const description = profile.description || `Book ${profile.name} for focused studio support, creative direction, or production help.`;
  const rateCents = getStaffRateCents(profile);
  const priceMarkup = rateCents
    ? `${formatCurrency(rateCents)}<span>/hr</span>`
    : `Request<span>rate</span>`;
  const featureLabels = [
    category,
    "5 hours max",
    "Bookable now",
  ];
  return `
    <article class="room-card room-catalog-card staff-catalog-card ${isSelected ? "is-selected" : ""}" data-staff-id="${escapeHtml(profile.id)}">
      <div class="room-catalog-media staff-catalog-media">
        <img
          class="room-card-image staff-catalog-image"
          src="${escapeHtml(profile.photo_url || STAFF_PLACEHOLDER_IMAGE)}"
          alt="${escapeHtml(profile.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='${STAFF_PLACEHOLDER_IMAGE}';"
        />
        <div class="room-catalog-media-badges">
          <span class="room-catalog-pill room-catalog-pill-category">${escapeHtml(category)}</span>
          <span class="room-catalog-pill room-catalog-pill-status is-available">Available</span>
        </div>
      </div>
      <div class="room-catalog-content">
        <div class="room-catalog-title-row">
          <h3 class="room-catalog-title ${isSelected ? "is-accent" : ""}">${escapeHtml(profile.name)}</h3>
          <span class="room-catalog-rating"><span aria-hidden="true">★</span> ${rating.toFixed(1).replace(".0", "")}</span>
        </div>
        <p class="room-catalog-description">${escapeHtml(description)}</p>
        <div class="room-catalog-feature-row" aria-label="Staff highlights">
          ${featureLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
        </div>
        <div class="availability-preview availability-preview-idle">
          <span class="availability-label">Live openings</span>
          <p>Select this staff member to load the same date, time, and checkout flow used for room bookings.</p>
          ${
            skills.length
              ? `<div class="preview-pill-row">${skills.map((skill) => `<span class="pill">${escapeHtml(skill)}</span>`).join("")}</div>`
              : ""
          }
        </div>
        <div class="room-catalog-meta-row">
          <span class="room-catalog-capacity">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="10" cy="6.5" r="2.6"></circle>
              <path d="M4.5 16c1-3 3.1-4.5 5.5-4.5s4.5 1.5 5.5 4.5"></path>
            </svg>
            Staff session
          </span>
          <strong class="room-catalog-price">${priceMarkup}</strong>
        </div>
        <div class="room-actions room-catalog-actions">
          <button class="primary-button room-catalog-book-button staff-book-button" type="button" data-staff-book-button="${escapeHtml(profile.id)}">
            Book now
          </button>
          <button class="ghost-button room-catalog-details-button staff-book-button-secondary" type="button" data-staff-book-button="${escapeHtml(profile.id)}">
            Select
          </button>
        </div>
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
  getStaffSearchInput()?.addEventListener("input", (event) => {
    staffSearchQuery = event.target.value || "";
    renderStaffDirectoryView(state);
  });
  getStaffCategoryBar()?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-staff-category]");
    if (!button) {
      return;
    }
    staffCategoryFilter = button.dataset.staffCategory || "all";
    renderStaffDirectoryView(state);
  });
  getStaffFilterToggle()?.addEventListener("click", () => {
    getStaffFilterPanel()?.classList.toggle("hidden");
  });
  getStaffSortSelect()?.addEventListener("change", (event) => {
    staffSortMode = event.target.value || "recommended";
    renderStaffDirectoryView(state);
  });
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
  getDurationDecreaseButton()?.addEventListener("click", () => {
    const allowedDurations = getAllowedStaffDurations();
    const currentIndex = allowedDurations.indexOf(getSelectedDurationMinutes());
    selectedDuration = allowedDurations[Math.max(0, currentIndex - 1)] || selectedDuration;
    renderStaffBookingShell({ currentUser: state.currentUser });
  });
  getDurationIncreaseButton()?.addEventListener("click", () => {
    const allowedDurations = getAllowedStaffDurations();
    const currentIndex = allowedDurations.indexOf(getSelectedDurationMinutes());
    selectedDuration = allowedDurations[Math.min(allowedDurations.length - 1, currentIndex + 1)] || selectedDuration;
    renderStaffBookingShell({ currentUser: state.currentUser });
  });
  getBookingServiceSelect()?.addEventListener("change", () => {
    renderStaffBookingShell({ currentUser: state.currentUser });
  });
  [getBookingNameInput(), getBookingPhoneInput(), getBookingEmailInput(), getBookingNotesInput()]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", () => {
        renderStaffBookingShell({ currentUser: state.currentUser });
      });
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
    renderStaffCategoryBar(profiles);
    const visibleProfiles = getVisibleStaffProfiles(profiles);
    const resultsCount = getStaffResultsCount();
    if (resultsCount) {
      resultsCount.textContent = `${visibleProfiles.length} staff member${visibleProfiles.length === 1 ? "" : "s"} found`;
    }
    elements.staffTeamGrid.innerHTML = visibleProfiles.length
      ? visibleProfiles.map(renderStaffCard).join("")
      : '<div class="empty-state">No staff matched those filters. Clear search or choose another specialty.</div>';
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
