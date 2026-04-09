import { elements, toggleHidden } from "../dom.js?v=20260401r";

let reloadPaymentSuccessAction = null;
let paymentSuccessPollTimer = null;
let paymentSuccessPollCount = 0;

function stopPolling() {
  if (paymentSuccessPollTimer) {
    window.clearInterval(paymentSuccessPollTimer);
    paymentSuccessPollTimer = null;
  }
  paymentSuccessPollCount = 0;
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

function ensurePolling(booking) {
  if (!reloadPaymentSuccessAction || !booking || booking.status !== "PendingPayment") {
    stopPolling();
    return;
  }
  if (paymentSuccessPollTimer) {
    return;
  }

  paymentSuccessPollTimer = window.setInterval(async () => {
    paymentSuccessPollCount += 1;
    await reloadPaymentSuccessAction("Checking payment status...");
    if (paymentSuccessPollCount >= 10) {
      stopPolling();
    }
  }, 3000);
}

export function initPaymentSuccessView(actions) {
  reloadPaymentSuccessAction = actions?.reloadPaymentSuccess || null;
  elements.paymentSuccessActions?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-payment-success-action]");
    if (!button) {
      return;
    }
    if (button.dataset.paymentSuccessAction === "refresh-status" && reloadPaymentSuccessAction) {
      await reloadPaymentSuccessAction("Checking payment status...");
    }
  });
}

export function renderPaymentSuccessView(state) {
  if (!elements.paymentSuccessEmpty || !elements.paymentSuccessCard) {
    return;
  }

  const booking = state.selectedBooking;
  const hasBooking = Boolean(booking);
  toggleHidden(elements.paymentSuccessEmpty, hasBooking);
  toggleHidden(elements.paymentSuccessCard, !hasBooking);

  if (!booking) {
    stopPolling();
    return;
  }

  const paymentSettled = booking.status === "Paid" || booking.status === "Completed";
  const paymentStillProcessing = booking.status === "PendingPayment";
  const title = paymentSettled
    ? "Payment successful"
    : paymentStillProcessing
      ? "Payment submitted"
      : `Payment status: ${booking.status}`;
  const copy = paymentSettled
    ? "Your payment went through and the booking is confirmed."
    : paymentStillProcessing
      ? "Stripe accepted the payment step. This page is checking for final booking confirmation now."
      : "This booking changed after payment. Review the booking details below.";

  elements.paymentSuccessTitle.textContent = title;
  elements.paymentSuccessCopy.textContent = copy;
  elements.paymentSuccessMeta.innerHTML = `
    <span class="pill">${booking.booking_code}</span>
    <span class="pill">${formatCurrency(booking.price_cents, booking.currency)}</span>
    <span class="pill">${booking.status}</span>
    <span class="pill">${formatBookingDate(booking.start_time)}</span>
  `;
  elements.paymentSuccessActions.innerHTML = `
    <a class="primary-button ghost-link" href="/booking?id=${booking.id}">View booking</a>
    <a class="ghost-button ghost-link" href="/bookings">Back to bookings</a>
    ${paymentStillProcessing ? '<button class="ghost-button" type="button" data-payment-success-action="refresh-status">Refresh status</button>' : ""}
  `;

  ensurePolling(booking);
  if (!paymentStillProcessing) {
    stopPolling();
  }
}
