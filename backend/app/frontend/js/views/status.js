import { elements, setText } from "../dom.js?v=20260421a";

export function renderStatus(state) {
  if (!elements.healthStatus || !elements.healthDetail || !elements.sessionStatus || !elements.sessionDetail) {
    return;
  }

  if (state.health?.status === "ok") {
    setText(elements.healthStatus, "Healthy", "is-success");
    setText(
      elements.healthDetail,
      `${state.health.service} is responding.`,
      "status-detail",
    );
  } else if (state.health === false) {
    setText(elements.healthStatus, "Unavailable", "is-error");
    setText(
      elements.healthDetail,
      "Health probe failed. Check the FastAPI process.",
      "status-detail",
    );
  } else {
    setText(elements.healthStatus, "Checking...", "");
    setText(elements.healthDetail, "Waiting for health probe.", "status-detail");
  }

  if (state.currentUser) {
    setText(elements.sessionStatus, state.currentUser.full_name || state.currentUser.email, "is-success");
    setText(
      elements.sessionDetail,
      state.currentUser.is_admin ? "Admin session active." : "Authenticated user session active.",
      "status-detail",
    );
  } else if (state.token) {
    setText(elements.sessionStatus, "Restoring session...", "");
    setText(
      elements.sessionDetail,
      "Loading your account.",
      "status-detail",
    );
  } else {
    const signedOutDetail = new Set(["home", "bookings", "reserve", "booking", "rooms", "info", "faq", "contact"]).has(
      document.body?.dataset.page,
    )
      ? "Continue as guest where available, or sign in to manage bookings."
      : "Create an account or log in to continue.";
    setText(elements.sessionStatus, "Signed out", "");
    setText(
      elements.sessionDetail,
      signedOutDetail,
      "status-detail",
    );
  }

  setText(elements.appMessage, state.message, "signal-copy");
}
