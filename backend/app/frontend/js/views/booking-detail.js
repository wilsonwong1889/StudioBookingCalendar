import { api } from "../api.js?v=20260421a";
import { downloadBookingCalendarFile } from "../calendar.js?v=20260408k";
import { downloadBookingReceiptPdf } from "../receipt.js?v=20260421a";
import { elements, toggleHidden } from "../dom.js?v=20260421a";
import { setState, state } from "../state.js?v=20260421a";

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

function getDateInputValue(value) {
  return String(value || "").split("T")[0] || new Date().toISOString().slice(0, 10);
}

function isAdminWaivedPayment(booking) {
  return booking.price_cents === 0 && String(booking.payment_intent_id || "").startsWith("admin_waived_");
}

function isAdminManualPayment(booking) {
  return String(booking.payment_intent_id || "").startsWith("admin_manual_paid_");
}

function buildPaymentSuccessUrl(bookingId) {
  const successUrl = new URL("/payment-success", window.location.origin);
  successUrl.searchParams.set("id", bookingId);
  return successUrl;
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

  return `
    <div class="staff-tag-group">
      <span>${label}</span>
      <div class="preview-pill-row">
        ${values.map((value) => `<span class="pill">${value}</span>`).join("")}
      </div>
    </div>
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
  const session = await api.getBookingPaymentSession(booking.id);
  activePaymentSession = session;
  return session;
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

function renderPaymentPanel(state, booking) {
  if (!elements.bookingPaymentPanel || !elements.bookingPaymentCopy || !elements.bookingPaymentControls) {
    return;
  }

  const isPending = booking.status === "PendingPayment";
  const canAdminWaivePayment = isPending && Boolean(state.currentUser?.is_admin);
  const canAdminMarkPaid = canAdminWaivePayment && booking.price_cents > 0;
  toggleHidden(elements.bookingPaymentPanel, !isPending);
  if (!isPending) {
    clearPaymentElement();
    return;
  }

  elements.bookingPaymentCopy.textContent = state.message || "Load the payment session to continue checkout.";
  elements.bookingPaymentControls.innerHTML = `
    <button class="ghost-button" type="button" data-booking-detail-action="load-payment" data-booking-id="${booking.id}">
      Load payment
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
    <button class="primary-button hidden" type="button" data-booking-detail-action="confirm-payment" data-booking-id="${booking.id}">
      Confirm payment
    </button>
  `;

  if (activePaymentSession?.booking_id === booking.id) {
    const confirmButton = elements.bookingPaymentControls.querySelector("[data-booking-detail-action='confirm-payment']");
    if (confirmButton && activePaymentSession.payment_backend === "stripe") {
      confirmButton.classList.remove("hidden");
    }
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
    rescheduleAvailability = await api.getAvailability(booking.room_id, targetDate);
    const validStarts = (rescheduleAvailability.available_start_times || []).filter(
      (startTime) =>
        Number(rescheduleAvailability.max_duration_minutes_by_start?.[startTime] || 0) >= booking.duration_minutes &&
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

  const canReschedule = ["PendingPayment", "Paid"].includes(booking.status) && !booking.checked_in_at;
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
    booking.status === "Completed" ||
    (booking.status === "Paid" && new Date(booking.end_time).getTime() <= Date.now());
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

  const assignments = booking.staff_assignments || [];
  elements.bookingDetailStaffList.innerHTML = assignments.length
    ? assignments
        .map(
          (assignment) => `
            <article class="staff-profile-card">
              <div class="staff-profile-card-top">
                ${renderStaffImage(assignment.photo_url, assignment.name)}
                <div class="staff-option-copy">
                  <strong>${assignment.name}</strong>
                  <span>${assignment.description || "Added to this booking."}</span>
                </div>
              </div>
              <strong class="staff-option-price">${formatCurrency(assignment.add_on_price_cents, booking.currency)}</strong>
              <div class="staff-option-copy">
                ${renderTagGroup("Skills", assignment.skills || [])}
                ${renderTagGroup("Talents", assignment.talents || [])}
              </div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">No extra staff add-ons were attached to this booking.</div>';
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
        const booking = await api.getBooking(button.dataset.bookingId);
        const session = await loadPaymentSession(booking);
        if (session.payment_backend === "stripe") {
          await mountStripePaymentForm(session);
          setState({ message: "Payment form loaded." });
        } else {
          toggleHidden(elements.bookingPaymentElement, true);
          setState({ message: "Stub payment session loaded. Configure Stripe to continue with live test checkout." });
        }
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
  toggleHidden(elements.bookingDetailEmpty, hasBooking);
  toggleHidden(elements.bookingDetailCard, !hasBooking);

  if (!booking) {
    clearPaymentDeadlineTimer();
    clearPaymentElement();
    reviewFormFingerprint = null;
    return;
  }

  elements.bookingDetailTitle.textContent = `${booking.status} • ${booking.booking_code}`;
  elements.bookingDetailWindow.textContent = `${formatBookingDate(booking.start_time)} to ${formatBookingDate(booking.end_time)}`;
  elements.bookingDetailMeta.innerHTML = `
    <span class="pill">${formatCurrency(booking.price_cents, booking.currency)}</span>
    <span class="pill">${formatDuration(booking.duration_minutes)}</span>
    <span class="pill">${booking.currency}</span>
    <span class="pill">${(booking.staff_assignments || []).length} staff profile${(booking.staff_assignments || []).length === 1 ? "" : "s"}</span>
    ${booking.checked_in_at ? `<span class="pill">Checked in ${formatBookingDate(booking.checked_in_at)}</span>` : ""}
    ${booking.payment_intent_id ? `<span class="pill">Payment ${booking.payment_intent_id}</span>` : ""}
  `;
  if (elements.bookingDetailNote) {
    elements.bookingDetailNote.textContent = booking.note
      ? `Booking notes: ${booking.note}`
      : "No booking notes added.";
  }
  renderStaffAssignments(booking);
  renderPaymentDeadline(booking);

  const canCancel = booking.status === "PendingPayment" || booking.status === "Paid";
  const canPay = booking.status === "PendingPayment";
  const canAddToCalendar = !["Cancelled", "Refunded"].includes(booking.status);
  const canDownloadReceipt = ["Paid", "Completed", "Refunded"].includes(booking.status);
  const settlementPill = isAdminWaivedPayment(booking)
    ? '<span class="pill">Admin free booking</span>'
    : isAdminManualPayment(booking)
      ? '<span class="pill">Manual payment noted</span>'
      : "";
  elements.bookingDetailActions.innerHTML = `
    ${canAddToCalendar ? `<button class="ghost-button" type="button" data-booking-detail-action="download-calendar" data-booking-id="${booking.id}">Add to calendar</button>` : ""}
    ${canDownloadReceipt ? `<button class="ghost-button" type="button" data-booking-detail-action="download-receipt" data-booking-id="${booking.id}">Download receipt PDF</button>` : ""}
    ${canCancel ? `<button class="ghost-button" type="button" data-booking-detail-action="cancel" data-booking-id="${booking.id}">Cancel booking</button>` : ""}
    ${canPay ? `<button class="ghost-button" type="button" data-booking-detail-action="load-payment" data-booking-id="${booking.id}">Continue payment</button>` : ""}
  `;
  if (settlementPill) {
    elements.bookingDetailMeta.insertAdjacentHTML("beforeend", settlementPill);
  }

  renderPaymentPanel(state, booking);
  renderReschedulePanel(booking);
  renderReviewPanel(state, booking);
}
