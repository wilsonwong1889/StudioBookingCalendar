import { api } from "../api.js?v=20260427a";
import { downloadBookingCalendarFile } from "../calendar.js?v=20260408k";
import { downloadBookingReceiptPdf } from "../receipt.js?v=20260422d";
import { getSearchParam } from "../config.js?v=20260422d";
import { elements, toggleHidden } from "../dom.js?v=20260427a";
import {
  getPersistedLastBookingId,
  persistCheckoutDraft,
  persistLastBookingId,
  setState,
  state,
} from "../state.js?v=20260427a";

let stripeClient = null;
let stripeElements = null;
let paymentElement = null;
let activePaymentSession = null;
let paymentDeadlineTimer = null;
let reloadBookingDetailAction = null;
let rescheduleAvailability = null;
let rescheduleBookingId = null;
let rescheduleDateValue = "";
let rescheduleLoading = false;
let rescheduleStatusMessage = "";
let reviewFormFingerprint = null;
let autoLoadingPaymentBookingId = null;
let publicConfigPromise = null;

const BOOKING_VISUALS = {
  recording: "/assets/media/studio-room-2.png",
  podcast: "/assets/media/studio-lobby-2.png",
  photography: "/assets/media/studio-room-2.png",
  film: "/assets/media/studio-exterior-2.png",
  dance: "/assets/media/studio-exterior-2.png",
  production: "/assets/media/studio-room-2.png",
};

function getBookingKind(booking) {
  const explicitKind = String(booking?.booking_kind || booking?.kind || "").toLowerCase();
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

function getBookingLocationLabel(booking) {
  if (getBookingKind(booking) === "staff") {
    return booking?.location_label || "Studio support session";
  }
  return booking?.location_label || "Downtown studio district";
}

function getBookingStaffEntity(booking) {
  if (getBookingKind(booking) !== "staff") {
    return null;
  }
  return (
    booking?.staff_profile ||
    booking?.staff ||
    (booking?.staff_name
      ? {
          name: booking.staff_name,
          description: booking.staff_description || booking.description || "Booked staff session",
          photo_url: booking.staff_photo_url || booking.photo_url || null,
          skills: booking.staff_skills || booking.skills || [],
          talents: booking.staff_talents || booking.talents || [],
          add_on_price_cents: booking.price_cents || booking.total_cents || 0,
        }
      : null)
  );
}

function getBookingVisual(booking) {
  if (getBookingKind(booking) === "staff" && (booking?.staff_photo_url || booking?.photo_url)) {
    return booking.staff_photo_url || booking.photo_url;
  }
  const category = inferBookingCategory(booking);
  return BOOKING_VISUALS[category] || BOOKING_VISUALS.recording;
}

function formatBookingDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(cents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "CAD",
  }).format((cents || 0) / 100);
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function formatShortDate(value) {
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

function formatTimeRange(startValue, endValue) {
  return `${formatTimeOnly(startValue)} to ${formatTimeOnly(endValue)}`;
}

function formatDateLine(value) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTimeLine(startValue, endValue) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startValue))} to ${formatter.format(new Date(endValue))}`;
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

function getBookingPrimaryKicker(booking) {
  if (booking.status === "PendingPayment") {
    return "Secure checkout";
  }
  if (booking.status === "Paid") {
    return "Confirmed booking";
  }
  if (booking.status === "Completed") {
    return "Completed session";
  }
  return "Booking";
}

function getBookingPrimaryTitle(booking) {
  const kind = getBookingKind(booking);
  if (booking.status === "PendingPayment") {
    return kind === "staff" ? "Complete your staff booking" : "Complete your booking";
  }
  if (booking.status === "Paid") {
    return kind === "staff" ? "Your staff booking is confirmed" : "Your booking is confirmed";
  }
  if (booking.status === "Completed") {
    return kind === "staff" ? "Review your completed staff booking" : "Review your completed booking";
  }
  if (booking.status === "Cancelled") {
    return "This booking was cancelled";
  }
  if (booking.status === "Refunded") {
    return "This booking was refunded";
  }
  return "Manage your booking";
}

function getBookingStatusLabel(booking) {
  return String(booking.status || "Booking").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function getBookingLayoutElements() {
  return {
    kicker: document.getElementById("booking-detail-kicker"),
    contact: document.getElementById("booking-detail-contact"),
    overviewStatus: document.getElementById("booking-overview-status"),
    sessionOverview: document.getElementById("booking-session-overview"),
    summaryRoom: document.getElementById("booking-summary-room"),
    summaryMedia: document.getElementById("booking-summary-media"),
    summaryMeta: document.getElementById("booking-summary-meta"),
    summaryPricing: document.getElementById("booking-summary-pricing"),
    summarySupport: document.getElementById("booking-summary-support"),
  };
}

function getDateInputValue(value) {
  return String(value || "").split("T")[0] || new Date().toISOString().slice(0, 10);
}

function isAdminWaivedPayment(booking) {
  return booking.price_cents === 0 && String(booking.payment_intent_id || "").startsWith("admin_waived_");
}

function isAdminManualPayment(booking) {
  return String(booking.payment_intent_id || "").startsWith("admin_manual_paid_");
}

function isCheckoutMode(booking) {
  return booking?.status === "PendingPayment";
}

function buildPaymentSuccessUrl(bookingId) {
  const successUrl = new URL("/payment-success", window.location.origin);
  successUrl.searchParams.set("id", bookingId);
  return successUrl;
}

function renderBookingEmptyState(currentState) {
  const resumeBookingId = getPersistedLastBookingId();
  const requestedKind = String(getSearchParam("kind") || "").toLowerCase();
  const defaultBrowseHref = requestedKind === "staff" ? "/staff" : "/rooms";
  const primaryHref = resumeBookingId ? `/booking?id=${resumeBookingId}` : defaultBrowseHref;
  const primaryLabel = resumeBookingId ? "Resume checkout" : requestedKind === "staff" ? "Browse staff" : "Browse studios";
  const secondaryHref = currentState.currentUser ? "/bookings" : "/account";
  const secondaryLabel = currentState.currentUser ? "My bookings" : "Sign in";
  const fallbackCopy = resumeBookingId
    ? "Your last booking is still available. Resume checkout to finish payment, review the summary, or jump back to your bookings."
    : requestedKind === "staff"
      ? "Start from Staff or My Bookings to open the active staff checkout with the correct booking details."
      : "Start from Rooms or My Bookings to open the active checkout with the correct booking details.";
  const message = currentState.message && currentState.message !== "Frontend booting." ? currentState.message : fallbackCopy;

  if (elements.bookingEmptyTitle) {
    elements.bookingEmptyTitle.textContent = resumeBookingId
      ? "Resume your booking checkout"
      : currentState.currentUser
        ? requestedKind === "staff"
          ? "Start a staff booking to open checkout"
          : "Start a booking to open checkout"
        : "Sign in or continue as guest to resume checkout";
  }
  if (elements.bookingEmptyCopy) {
    elements.bookingEmptyCopy.textContent = message;
  }
  if (elements.bookingEmptyPrimaryLink) {
    elements.bookingEmptyPrimaryLink.href = primaryHref;
    elements.bookingEmptyPrimaryLink.textContent = primaryLabel;
  }
  if (elements.bookingEmptySecondaryLink) {
    elements.bookingEmptySecondaryLink.href = secondaryHref;
    elements.bookingEmptySecondaryLink.textContent = secondaryLabel;
  }
}

function renderStaffImage(photoUrl, label) {
  if (photoUrl) {
    return `<img class="staff-profile-image" src="${photoUrl}" alt="${label}" loading="lazy" />`;
  }
  return `<div class="staff-profile-image staff-avatar-fallback">${label.slice(0, 1).toUpperCase()}</div>`;
}

function renderTagGroup(label, values = []) {
  if (!values.length) {
    return "";
  }

  const visibleValues = values.slice(0, 3);
  const hiddenCount = values.length - visibleValues.length;

  return `
    <div class="staff-tag-group">
      <span>${label}</span>
      <div class="preview-pill-row">
        ${visibleValues.map((value) => `<span class="pill">${value}</span>`).join("")}
        ${hiddenCount > 0 ? `<span class="pill">+${hiddenCount} more</span>` : ""}
      </div>
    </div>
  `;
}

function renderSummaryLine(label, value) {
  return `<div class="summary-line"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderReadonlyField(label, value, className = "") {
  return `
    <label class="booking-contact-field ${className}">
      <span>${label}</span>
      <div class="booking-contact-value">${value || "Not provided"}</div>
    </label>
  `;
}

function clearPaymentElement() {
  if (paymentElement) {
    paymentElement.unmount();
    paymentElement = null;
  }
  stripeElements = null;
  stripeClient = null;
  activePaymentSession = null;
  autoLoadingPaymentBookingId = null;
}

function clearPaymentDeadlineTimer() {
  if (paymentDeadlineTimer) {
    window.clearInterval(paymentDeadlineTimer);
    paymentDeadlineTimer = null;
  }
}

function getPaymentDeadlineElement() {
  return document.getElementById("booking-payment-deadline");
}

function renderPaymentDeadline(booking) {
  const deadlineElement = getPaymentDeadlineElement();
  if (!deadlineElement) {
    return;
  }

  clearPaymentDeadlineTimer();

  if (booking.status !== "PendingPayment" || !booking.payment_expires_at) {
    deadlineElement.classList.add("hidden");
    deadlineElement.textContent = "";
    return;
  }

  const updateCountdown = () => {
    const secondsRemaining = Math.max(
      0,
      Math.floor((new Date(booking.payment_expires_at).getTime() - Date.now()) / 1000),
    );
    deadlineElement.classList.remove("hidden");
    deadlineElement.className = "panel-copy payment-deadline-note";
    deadlineElement.textContent = `This spot is saved until ${formatBookingDate(booking.payment_expires_at)}. Time left: ${formatCountdown(secondsRemaining)}.`;

    if (secondsRemaining <= 0) {
      clearPaymentDeadlineTimer();
      if (reloadBookingDetailAction) {
        void reloadBookingDetailAction("Your 5-minute payment window expired.");
      }
    }
  };

  updateCountdown();
  paymentDeadlineTimer = window.setInterval(updateCountdown, 1000);
}

async function loadPaymentSession(booking) {
  const session =
    getBookingKind(booking) === "staff"
      ? await api.getStaffBookingPaymentSession(booking.id)
      : await api.getBookingPaymentSession(booking.id);
  activePaymentSession = session;
  return session;
}

async function getPublicConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = fetch("/api/public/config").then(async (response) => {
      if (!response.ok) {
        throw new Error("Unable to load payment configuration");
      }
      return response.json();
    });
  }
  return publicConfigPromise;
}

async function mountStripePaymentForm(session) {
  if (!window.Stripe || !session.stripe_publishable_key) {
    throw new Error("Stripe publishable key is not configured");
  }

  clearPaymentElement();
  activePaymentSession = session;
  toggleHidden(elements.bookingPaymentElement, false);
  stripeClient = window.Stripe(session.stripe_publishable_key);
  stripeElements = stripeClient.elements({ clientSecret: session.payment_client_secret });
  paymentElement = stripeElements.create("payment");
  paymentElement.mount("#booking-payment-element");
  elements.bookingPaymentElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function ensureStripePaymentSession(booking) {
  if (
    !booking ||
    !isCheckoutMode(booking) ||
    activePaymentSession?.booking_id === booking.id ||
    autoLoadingPaymentBookingId === booking.id
  ) {
    return;
  }

  autoLoadingPaymentBookingId = booking.id;
  try {
    if (booking.payment_client_secret) {
      const publicConfig = await getPublicConfig().catch(() => null);
      if (publicConfig?.stripe_publishable_key) {
        const draftSession = {
          booking_id: booking.id,
          payment_intent_id: booking.payment_intent_id || String(booking.id),
          payment_client_secret: booking.payment_client_secret,
          payment_backend: "stripe",
          stripe_publishable_key: publicConfig.stripe_publishable_key,
          payment_expires_at: booking.payment_expires_at || null,
          payment_seconds_remaining: booking.payment_seconds_remaining || null,
        };
        await mountStripePaymentForm(draftSession);
        setState({ message: "Secure payment is ready." });
        return;
      }
    }

    const session = await loadPaymentSession(booking);
    if (session.payment_backend === "stripe") {
      await mountStripePaymentForm(session);
      setState({ message: "Secure payment is ready." });
    } else {
      toggleHidden(elements.bookingPaymentElement, true);
      setState({
        message:
          "Stub payment mode is active. Switch PAYMENT_BACKEND to stripe and configure Stripe keys to use live test checkout.",
      });
    }
  } catch (error) {
    setState({ message: error.message || "Unable to load the payment form right now." });
  } finally {
    autoLoadingPaymentBookingId = null;
  }
}

function renderPaymentPanel(state, booking) {
  if (!elements.bookingPaymentPanel || !elements.bookingPaymentCopy || !elements.bookingPaymentControls) {
    return;
  }

  const isPending = booking.status === "PendingPayment";
  const canAdminWaivePayment = isPending && Boolean(state.currentUser?.is_admin) && getBookingKind(booking) !== "staff";
  const canAdminMarkPaid = canAdminWaivePayment && booking.price_cents > 0;
  toggleHidden(elements.bookingPaymentPanel, !isPending);
  if (!isPending) {
    elements.bookingPaymentControls.innerHTML = "";
    clearPaymentElement();
    return;
  }

  elements.bookingPaymentCopy.textContent =
    activePaymentSession?.booking_id === booking.id && activePaymentSession.payment_backend === "stripe"
      ? "Review your details, enter payment in the secure Stripe form below, and confirm to lock in the session."
      : autoLoadingPaymentBookingId === booking.id
        ? "Preparing the secure Stripe checkout..."
        : state.message || "Preparing the secure Stripe checkout...";
  const primaryAction =
    activePaymentSession?.booking_id === booking.id && activePaymentSession.payment_backend === "stripe"
      ? "confirm-payment"
      : "load-payment";
  const primaryLabel =
    activePaymentSession?.booking_id === booking.id && activePaymentSession.payment_backend === "stripe"
      ? `Pay ${formatCurrency(booking.price_cents, booking.currency)}`
      : "Secure payment";
  elements.bookingPaymentControls.innerHTML = `
    <button class="primary-button" type="button" data-booking-detail-action="${primaryAction}" data-booking-id="${booking.id}">
      ${primaryLabel}
    </button>
    ${
      canAdminMarkPaid
        ? `<button class="ghost-button" type="button" data-booking-detail-action="mark-paid" data-booking-id="${booking.id}">
      Mark paid manually as admin
    </button>`
        : ""
    }
    ${
      canAdminWaivePayment
        ? `<button class="ghost-button" type="button" data-booking-detail-action="waive-payment" data-booking-id="${booking.id}">
      Skip Stripe as admin
    </button>`
        : ""
    }
  `;

  if (activePaymentSession?.booking_id === booking.id) {
    if (activePaymentSession.payment_backend !== "stripe") {
      elements.bookingPaymentCopy.textContent =
        "Stub payment mode is active. Switch PAYMENT_BACKEND to stripe and configure Stripe keys to use live test checkout.";
    }
  } else {
    toggleHidden(elements.bookingPaymentElement, true);
  }
}

async function loadRescheduleAvailability(booking, targetDate) {
  if (!booking || !targetDate) {
    return;
  }

  rescheduleBookingId = booking.id;
  rescheduleDateValue = targetDate;
  rescheduleLoading = true;
  rescheduleStatusMessage = "Loading available start times...";
  setState({ message: state.message });

  try {
    if (getBookingKind(booking) === "staff") {
      const staffId = booking.staff_profile_id || booking.staff_id || booking.staff_profile?.id;
      if (!staffId) {
        throw new Error("This staff booking does not include a staff profile id.");
      }
      rescheduleAvailability = await api.getStaffAvailability(staffId, targetDate).catch(() => null);
    } else {
      rescheduleAvailability = await api.getAvailability(booking.room_id, targetDate);
    }
    const validStarts = (rescheduleAvailability?.available_start_times || []).filter(
      (startTime) =>
        Number(rescheduleAvailability?.max_duration_minutes_by_start?.[startTime] || 0) >= booking.duration_minutes &&
        startTime !== booking.start_time,
    );
    rescheduleStatusMessage = validStarts.length
      ? `Choose from ${validStarts.length} open start time${validStarts.length === 1 ? "" : "s"} on ${targetDate}.`
      : "No alternate starts are open for this booking duration on that date.";
  } catch (error) {
    rescheduleAvailability = null;
    rescheduleStatusMessage = error.message;
  } finally {
    rescheduleLoading = false;
    setState({ message: state.message });
  }
}

function renderReschedulePanel(booking) {
  if (
    !elements.bookingReschedulePanel ||
    !elements.bookingRescheduleDate ||
    !elements.bookingRescheduleStart ||
    !elements.bookingRescheduleStatus ||
    !elements.bookingRescheduleSubmit
  ) {
    return;
  }

  const canReschedule = booking.status === "Paid" && !booking.checked_in_at;
  toggleHidden(elements.bookingReschedulePanel, !canReschedule);
  if (!canReschedule) {
    return;
  }

  const nextDate = rescheduleDateValue || getDateInputValue(booking.start_time);
  if (elements.bookingRescheduleDate.value !== nextDate) {
    elements.bookingRescheduleDate.value = nextDate;
  }

  if (rescheduleBookingId !== booking.id || rescheduleDateValue !== nextDate) {
    void loadRescheduleAvailability(booking, nextDate);
  }

  const validStarts = (rescheduleAvailability?.available_start_times || []).filter(
    (startTime) =>
      Number(rescheduleAvailability?.max_duration_minutes_by_start?.[startTime] || 0) >= booking.duration_minutes &&
      startTime !== booking.start_time,
  );
  elements.bookingRescheduleStart.innerHTML = validStarts.length
    ? validStarts
        .map(
          (startTime) => `
            <option value="${startTime}">
              ${formatBookingDate(startTime)}
            </option>
          `,
        )
        .join("")
    : '<option value="">No alternate times available</option>';
  elements.bookingRescheduleSubmit.disabled = rescheduleLoading || !validStarts.length;
  elements.bookingRescheduleStatus.textContent = rescheduleLoading
    ? "Loading available start times..."
    : rescheduleStatusMessage ||
      `Move this booking to a different start time while keeping the same ${formatDuration(booking.duration_minutes)} duration.`;
}

function renderReviewPanel(currentState, booking) {
  if (!elements.bookingReviewPanel || !elements.bookingReviewForm || !elements.bookingReviewStatus) {
    return;
  }

  const canReview =
    getBookingKind(booking) !== "staff" &&
    (booking.status === "Completed" || (booking.status === "Paid" && new Date(booking.end_time).getTime() <= Date.now()));
  toggleHidden(elements.bookingReviewPanel, !canReview);
  if (!canReview) {
    reviewFormFingerprint = null;
    return;
  }

  const review = currentState.selectedBookingReview;
  const nextFingerprint = JSON.stringify({
    bookingId: booking.id,
    reviewId: review?.id || null,
    rating: review?.rating || null,
    comment: review?.comment || null,
  });
  if (reviewFormFingerprint !== nextFingerprint) {
    elements.bookingReviewForm.elements.rating.value = String(review?.rating || 5);
    elements.bookingReviewForm.elements.comment.value = review?.comment || "";
    reviewFormFingerprint = nextFingerprint;
  }

  elements.bookingReviewStatus.textContent = review
    ? `Last updated ${formatBookingDate(review.updated_at || review.created_at)} by ${review.reviewer_name || "you"}.`
    : "Leave a review once the session wraps so future guests can judge the room with more confidence.";
  const submitButton = elements.bookingReviewForm.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.textContent = review ? "Update review" : "Save review";
  }
}

function renderStaffAssignments(booking) {
  if (!elements.bookingDetailStaffList) {
    return;
  }

  const assignments =
    getBookingKind(booking) === "staff"
      ? [getBookingStaffEntity(booking)].filter(Boolean)
      : booking.staff_assignments || [];
  elements.bookingDetailStaffList.innerHTML = assignments.length
    ? assignments
        .map(
          (assignment) => `
            <article class="booking-staff-card staff-profile-card" style="gap: 12px; padding: 14px;">
              <div class="booking-staff-card-top staff-profile-card-top" style="grid-template-columns: auto minmax(0, 1fr) auto; align-items: start;">
                ${renderStaffImage(assignment.photo_url, assignment.name)}
                <div class="booking-staff-card-copy">
                  <strong>${assignment.name}</strong>
                  <span>${assignment.description || (getBookingKind(booking) === "staff" ? "Booked staff session" : "Attached to this booking as an add-on.")}</span>
                </div>
                <strong class="booking-staff-card-price staff-option-price">${formatCurrency(assignment.add_on_price_cents, booking.currency)}</strong>
              </div>
              <div class="booking-staff-card-tags">
                ${renderTagGroup("Skills", assignment.skills || [])}
                ${renderTagGroup("Talents", assignment.talents || [])}
              </div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">No extra staff add-ons were attached to this booking.</div>';
}

function renderBookingSummaryLayout(booking) {
  const layout = getBookingLayoutElements();
  const kind = getBookingKind(booking);
  const bookingTitle = getBookingDisplayName(booking);
  const roomName = booking.room_name || "Studio booking";
  const staffTotal = (booking.staff_assignments || []).reduce(
    (sum, assignment) => sum + Number(assignment.add_on_price_cents || 0),
    0,
  );
  const roomSubtotal = Math.max(0, Number(booking.price_cents || 0) - staffTotal);
  const statusLabel = getBookingStatusLabel(booking);
  const staffCount = (booking.staff_assignments || []).length;
  const contactName = booking.user_full_name || "Guest booking";
  const contactEmail = booking.user_email || "No email on file";
  const contactPhone = booking.user_phone || "No phone on file";
  const supportCopy =
    booking.status === "PendingPayment"
      ? kind === "staff"
        ? "Load payment to finish checkout and keep the staff session reserved."
        : "Load payment to finish checkout and keep the slot reserved."
      : booking.status === "Paid"
        ? "Calendar, receipt, reschedule, and review tools stay attached here."
        : "Use this page for history, receipts, and follow-up actions.";

  if (layout.kicker) {
    layout.kicker.textContent = getBookingPrimaryKicker(booking);
  }
  if (layout.overviewStatus) {
    layout.overviewStatus.textContent = statusLabel;
    layout.overviewStatus.className = `pill status-${String(booking.status || "").toLowerCase()}`;
  }

  const fallbackSummaryMarkup = `
    <div class="booking-detail-summary-shell" style="display:grid; gap: 16px; grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr); align-items: start;">
      <div class="booking-detail-summary-main" style="display:grid; gap: 12px;">
        <div class="summary-stack">
          ${renderSummaryLine(kind === "staff" ? "Staff" : "Room", bookingTitle)}
          ${renderSummaryLine("Date", formatShortDate(booking.start_time))}
          ${renderSummaryLine("Time", formatTimeRange(booking.start_time, booking.end_time))}
          ${renderSummaryLine("Duration", formatDuration(booking.duration_minutes))}
        </div>
        <div class="summary-stack">
          ${renderSummaryLine("Status", statusLabel)}
          ${renderSummaryLine("Booking code", booking.booking_code)}
          ${renderSummaryLine("Access", state.currentUser ? "Signed in" : "Guest booking")}
        </div>
      </div>
      <aside class="booking-detail-summary-side" style="display:grid; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.82);">
        <div class="summary-stack">
          ${renderSummaryLine("Total", formatCurrency(booking.price_cents, booking.currency))}
          ${renderSummaryLine("Staff add-ons", staffTotal ? formatCurrency(staffTotal, booking.currency) : "None")}
          ${booking.payment_intent_id ? renderSummaryLine("Payment ref", booking.payment_intent_id) : renderSummaryLine("Payment state", statusLabel)}
          ${renderSummaryLine("Add-ons", `${staffCount} profile${staffCount === 1 ? "" : "s"}`)}
        </div>
        <p class="panel-copy" style="margin: 0;">${supportCopy}</p>
      </aside>
    </div>
  `;

  if (
    layout.contact &&
    layout.sessionOverview &&
    layout.summaryRoom &&
    layout.summaryMeta &&
    layout.summaryPricing &&
    layout.summarySupport &&
    layout.summaryMedia
  ) {
    const category = inferBookingCategory(booking);
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    const visual = getBookingVisual(booking);
    const typeLabel = getBookingTypeLabel(booking);

    layout.contact.innerHTML = `
      ${renderReadonlyField("Full name", contactName, "booking-contact-field-full")}
      ${renderReadonlyField("Email", contactEmail)}
      ${renderReadonlyField("Phone", contactPhone)}
      ${renderReadonlyField("Notes for the studio (optional)", booking.note || "No notes added for this booking.", "booking-contact-field-full")}
    `;

    layout.sessionOverview.innerHTML = `
      ${renderSummaryLine(kind === "staff" ? "Staff" : "Room", bookingTitle)}
      ${renderSummaryLine("Date", formatDateLine(booking.start_time))}
      ${renderSummaryLine("Time", formatTimeLine(booking.start_time, booking.end_time))}
      ${renderSummaryLine("Duration", formatDuration(booking.duration_minutes))}
      ${renderSummaryLine("Booking code", booking.booking_code)}
      ${
        booking.payment_intent_id
          ? renderSummaryLine("Payment reference", booking.payment_intent_id)
          : renderSummaryLine("Payment status", statusLabel)
      }
    `;

    layout.summaryRoom.textContent = bookingTitle;
    layout.summaryMedia.innerHTML = `
      <div class="booking-summary-room-card">
        <img class="booking-summary-room-image" src="${visual}" alt="${roomName}" loading="lazy" />
        <div class="booking-summary-room-copy">
          <div class="booking-summary-room-pills">
            <span class="pill">${typeLabel}</span>
            <span class="pill">${categoryLabel}</span>
            <span class="pill status-${String(booking.status || "").toLowerCase()}">${statusLabel}</span>
          </div>
          <strong>${bookingTitle}</strong>
          <span>${getBookingLocationLabel(booking)}</span>
        </div>
      </div>
    `;
    layout.summaryMeta.innerHTML = `
      ${renderSummaryLine("Date", formatDateLine(booking.start_time))}
      ${renderSummaryLine("Time", `${formatTimeOnly(booking.start_time)} • ${formatDuration(booking.duration_minutes)}`)}
      ${
        kind === "staff"
          ? renderSummaryLine("Service", booking.service_type || "Staff session")
          : renderSummaryLine("Staff", `${staffCount} add-on${staffCount === 1 ? "" : "s"}`)
      }
    `;
    layout.summaryPricing.innerHTML =
      kind === "staff"
        ? `
          <div class="booking-summary-price-line"><span>Session rate</span><strong>${formatCurrency(booking.subtotal_cents ?? booking.price_cents, booking.currency)}</strong></div>
          ${
            Number(booking.tax_cents || 0) > 0
              ? `<div class="booking-summary-price-line"><span>Taxes & fees</span><strong>${formatCurrency(booking.tax_cents, booking.currency)}</strong></div>`
              : ""
          }
          <div class="booking-summary-price-line"><span>Service fee</span><strong class="booking-summary-price-free">${Number(booking.service_fee_cents || 0) > 0 ? formatCurrency(booking.service_fee_cents, booking.currency) : "Free"}</strong></div>
          <div class="booking-summary-total"><span>Total</span><strong>${formatCurrency(booking.total_cents ?? booking.price_cents, booking.currency)}</strong></div>
        `
        : `
          <div class="booking-summary-price-line"><span>${formatCurrency(roomSubtotal, booking.currency)} room session</span><strong>${formatCurrency(roomSubtotal, booking.currency)}</strong></div>
          ${
            staffTotal
              ? `<div class="booking-summary-price-line"><span>Staff add-ons</span><strong>${formatCurrency(staffTotal, booking.currency)}</strong></div>`
              : ""
          }
          <div class="booking-summary-price-line"><span>Service fee</span><strong class="booking-summary-price-free">Free</strong></div>
          <div class="booking-summary-total"><span>Total</span><strong>${formatCurrency(booking.price_cents, booking.currency)}</strong></div>
        `;
    layout.summarySupport.innerHTML = `
      <div class="booking-summary-support-item">${kind === "staff" ? "Free cancellation up to 24h before when the booking has not started." : "Free cancellation up to 24h before when the booking has not started."}</div>
      <div class="booking-summary-support-item">Instant confirmation is delivered after payment succeeds.</div>
      <div class="booking-summary-support-item">${supportCopy}</div>
    `;
    return;
  }

  if (elements.bookingDetailMeta) {
    elements.bookingDetailMeta.innerHTML = fallbackSummaryMarkup;
  }
}

export function initBookingDetailView(actions) {
  if (!elements.bookingDetailActions) {
    return;
  }

  reloadBookingDetailAction = actions?.reloadBookingDetail || null;

  const handleAction = async (event) => {
    const button = event.target.closest("[data-booking-detail-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.bookingDetailAction;

    try {
      if (action === "cancel") {
        const confirmed = window.confirm("Are you sure you want to cancel this booking?");
        if (!confirmed) {
          return;
        }
        setState({ message: "Cancelling booking..." });
        const booking = await api.cancelBooking(button.dataset.bookingId, { reason: "Cancelled by user" });
        clearPaymentElement();
        setState({ selectedBooking: booking, message: "Booking cancelled." });
        if (actions?.reloadBookingDetail) {
          await actions.reloadBookingDetail("Booking detail refreshed.");
        }
        return;
      }

      if (action === "load-payment") {
        setState({ message: "Loading payment session..." });
        const booking =
          state.selectedBooking && String(state.selectedBooking.id) === String(button.dataset.bookingId)
            ? state.selectedBooking
            : await api.getBooking(button.dataset.bookingId);
        await ensureStripePaymentSession(booking);
        if (actions?.reloadBookingDetail) {
          await actions.reloadBookingDetail("Payment session ready.");
        }
        return;
      }

      if (action === "confirm-payment") {
        if (!stripeClient || !stripeElements || !activePaymentSession) {
          throw new Error("Load the payment session first");
        }
        setState({ message: "Confirming payment..." });
        const successUrl = buildPaymentSuccessUrl(activePaymentSession.booking_id);
        const submitResult = await stripeElements.submit();
        if (submitResult?.error) {
          throw new Error(submitResult.error.message || "Payment details are incomplete");
        }
        const result = await stripeClient.confirmPayment({
          elements: stripeElements,
          clientSecret: activePaymentSession.payment_client_secret,
          confirmParams: {
            return_url: successUrl.toString(),
          },
          redirect: "if_required",
        });
        if (result.error) {
          throw new Error(result.error.message || "Payment confirmation failed");
        }
        window.location.assign(successUrl.toString());
        return;
      }

      if (action === "waive-payment") {
        const confirmed = window.confirm("Skip Stripe and mark this booking free?");
        if (!confirmed) {
          return;
        }
        setState({ message: "Skipping Stripe and marking booking free..." });
        const booking = await api.adminWaiveBookingPayment(button.dataset.bookingId);
        clearPaymentElement();
        setState({ selectedBooking: booking, message: "Booking marked free." });
        window.location.assign(buildPaymentSuccessUrl(booking.id).toString());
        return;
      }

      if (action === "mark-paid") {
        const confirmed = window.confirm("Mark this booking paid manually?");
        if (!confirmed) {
          return;
        }
        setState({ message: "Marking booking paid manually..." });
        const booking = await api.adminMarkBookingPaid(button.dataset.bookingId);
        clearPaymentElement();
        setState({ selectedBooking: booking, message: "Booking marked paid manually." });
        window.location.assign(buildPaymentSuccessUrl(booking.id).toString());
        return;
      }

      if (action === "download-calendar") {
        const booking = await api.getBooking(button.dataset.bookingId);
        downloadBookingCalendarFile(booking);
        setState({ message: "Calendar file downloaded." });
        return;
      }

      if (action === "download-receipt") {
        const booking = await api.getBooking(button.dataset.bookingId);
        await downloadBookingReceiptPdf(booking.id, booking.booking_code);
        setState({ message: "Receipt PDF downloaded." });
        return;
      }
    } catch (error) {
      setState({ message: error.message });
    }
  };

  elements.bookingDetailActions.addEventListener("click", handleAction);
  elements.bookingPaymentControls?.addEventListener("click", handleAction);
  elements.bookingRescheduleDate?.addEventListener("change", () => {
    if (!state.selectedBooking) {
      return;
    }
    void loadRescheduleAvailability(state.selectedBooking, elements.bookingRescheduleDate.value);
  });
  elements.bookingRescheduleSubmit?.addEventListener("click", async () => {
    if (!state.selectedBooking || !elements.bookingRescheduleStart?.value) {
      setState({ message: "Choose a new start time before rescheduling." });
      return;
    }

    try {
      setState({ message: "Rescheduling booking..." });
      const booking = await api.rescheduleBooking(state.selectedBooking.id, {
        start_time: elements.bookingRescheduleStart.value,
      });
      rescheduleAvailability = null;
      rescheduleBookingId = null;
      rescheduleDateValue = "";
      rescheduleStatusMessage = "";
      setState({ selectedBooking: booking, message: "Booking rescheduled." });
      if (actions?.reloadBookingDetail) {
        await actions.reloadBookingDetail("Booking detail refreshed.");
      }
    } catch (error) {
      setState({ message: error.message });
    }
  });
  elements.bookingReviewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedBooking) {
      return;
    }

    try {
      const review = await api.saveBookingReview(state.selectedBooking.id, {
        rating: Number(elements.bookingReviewForm.elements.rating.value || 5),
        comment: elements.bookingReviewForm.elements.comment.value.trim() || null,
      });
      setState({ selectedBookingReview: review, message: "Review saved." });
    } catch (error) {
      setState({ message: error.message });
    }
  });
}

export function renderBookingDetailView(state) {
  if (!elements.bookingDetailEmpty || !elements.bookingDetailCard) {
    return;
  }

  const booking = state.selectedBooking;
  const hasBooking = Boolean(booking);
  const checkoutMode = isCheckoutMode(booking);
  renderBookingEmptyState(state);
  toggleHidden(elements.bookingDetailEmpty, hasBooking);
  toggleHidden(elements.bookingDetailCard, !hasBooking);

  if (!booking) {
    clearPaymentDeadlineTimer();
    clearPaymentElement();
    reviewFormFingerprint = null;
    return;
  }

  persistLastBookingId(booking.id);
  persistCheckoutDraft(
    booking.status === "PendingPayment"
      ? { booking }
      : null,
  );
  elements.bookingDetailCard.classList.toggle("is-checkout-mode", checkoutMode);
  elements.bookingDetailTitle.textContent = checkoutMode
    ? getBookingPrimaryTitle(booking)
    : booking.room_name || getBookingPrimaryTitle(booking);
  elements.bookingDetailWindow.textContent = checkoutMode
    ? "Review your reservation and confirm payment to lock in your slot."
    : `${formatDateLine(booking.start_time)} • ${formatTimeLine(booking.start_time, booking.end_time)}`;
  if (elements.bookingDetailNote) {
    elements.bookingDetailNote.textContent = booking.note
      ? `Booking note: ${booking.note}`
      : booking.status === "PendingPayment"
        ? "Review the summary, finish payment, and keep the slot reserved."
        : booking.status === "Paid"
          ? "Use the actions below to add the booking to your calendar, download a receipt, or reschedule."
          : "This booking is archived here for reference, follow-up actions, and receipts.";
  }
  renderBookingSummaryLayout(booking);
  renderStaffAssignments(booking);
  renderPaymentDeadline(booking);

  const canCancel = booking.status === "PendingPayment" || booking.status === "Paid";
  const canPay = booking.status === "PendingPayment";
  const canAddToCalendar = ["Paid", "Completed"].includes(booking.status);
  const canDownloadReceipt = ["Paid", "Completed", "Refunded"].includes(booking.status);
  elements.bookingDetailActions.innerHTML = `
    ${canAddToCalendar ? `<button class="ghost-button" type="button" data-booking-detail-action="download-calendar" data-booking-id="${booking.id}">Add to calendar</button>` : ""}
    ${canDownloadReceipt ? `<button class="ghost-button" type="button" data-booking-detail-action="download-receipt" data-booking-id="${booking.id}">Download receipt PDF</button>` : ""}
    ${canCancel ? `<button class="ghost-button" type="button" data-booking-detail-action="cancel" data-booking-id="${booking.id}">Cancel booking</button>` : ""}
  `;
  toggleHidden(elements.bookingSessionPanel, checkoutMode);
  toggleHidden(elements.bookingStaffPanel, checkoutMode);
  toggleHidden(elements.bookingDetailActions, checkoutMode);

  renderPaymentPanel(state, booking);
  renderReschedulePanel(booking);
  renderReviewPanel(state, booking);
  if (canPay) {
    void ensureStripePaymentSession(booking);
  }
}
