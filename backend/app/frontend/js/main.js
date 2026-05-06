import { api } from "./api.js?v=20260502a";
import { CURRENT_PAGE, getSearchParam } from "./config.js?v=20260422d";
import {
  getPersistedCheckoutDraft,
  getPersistedLastBookingId,
  persistCheckoutDraft,
  persistLastBookingId,
  setState,
  state,
  subscribe,
  persistToken,
} from "./state.js?v=20260427a";
import { initAdminView, renderAdminView } from "./views/admin.js?v=20260502a";
import { initAuthView, renderAuthView } from "./views/auth.js?v=20260506b";
import { initBookingDetailView, renderBookingDetailView } from "./views/booking-detail.js?v=20260505b";
import { initBookingsView, renderBookingsView } from "./views/bookings.js?v=20260427a";
import { initHomeView, renderHomeView } from "./views/home.js?v=20260422e";
import { initInfoView, renderInfoView } from "./views/info.js?v=20260424b";
import { initPaymentSuccessView, renderPaymentSuccessView } from "./views/payment-success.js?v=20260424b";
import { initProfileView, renderProfileView } from "./views/profile.js?v=20260424c";
import { initRoomBookingView, renderRoomBookingView } from "./views/room-booking.js?v=20260505b";
import { initRoomDetailView, renderRoomDetailView } from "./views/room-detail.js?v=20260424b";
import { initRoomsView, renderRoomsView } from "./views/rooms.js?v=20260424c";
import { initStaffDirectoryView, renderStaffDirectoryView } from "./views/staff-directory.js?v=20260505b";
import { renderStatus } from "./views/status.js?v=20260424b";

const PAGE_DATA_REQUIREMENTS = {
  home: { rooms: true, bookings: false, admin: false, selectedRoom: false, selectedBooking: false },
  account: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: false },
  contact: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: false, publicStaff: false },
  faq: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: false, publicStaff: false },
  info: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: false, publicStaff: false },
  rooms: { rooms: true, bookings: false, admin: false, selectedRoom: false, selectedBooking: false },
  room: { rooms: false, bookings: false, admin: false, selectedRoom: true, selectedBooking: false },
  reserve: { rooms: false, bookings: false, admin: false, selectedRoom: true, selectedBooking: false },
  staff: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: false, publicStaff: true },
  bookings: { rooms: true, bookings: true, admin: false, selectedRoom: false, selectedBooking: false },
  booking: { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: true },
  "payment-success": { rooms: false, bookings: false, admin: false, selectedRoom: false, selectedBooking: true },
  admin: { rooms: true, bookings: false, admin: true, selectedRoom: false, selectedBooking: false },
};

function currentRequirements() {
  return PAGE_DATA_REQUIREMENTS[CURRENT_PAGE] || PAGE_DATA_REQUIREMENTS.home;
}

function getBookingKind(booking, fallbackKind = null) {
  const explicitKind = String(booking?.booking_kind || booking?.kind || fallbackKind || "").toLowerCase();
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

function normalizeBookingRecord(booking, fallbackKind = null) {
  if (!booking) {
    return booking;
  }

  const kind = getBookingKind(booking, fallbackKind);
  const staffName =
    booking.staff_name ||
    booking.staff_profile_name ||
    booking.staff_profile?.name ||
    booking.service_type ||
    booking.room_name ||
    "Staff booking";
  return {
    ...booking,
    booking_kind: kind,
    kind,
    room_name: kind === "staff" ? staffName : booking.room_name,
    staff_name: kind === "staff" ? staffName : booking.staff_name,
    staff_photo_url: booking.staff_photo_url || booking.staff_profile?.photo_url || booking.staff_profile?.avatar_url || null,
    location_label: booking.location_label || booking.room_location || (kind === "staff" ? "Staff session" : "Downtown studio district"),
  };
}

function renderApp(currentState) {
  renderHomeView(currentState);
  renderStatus(currentState);
  renderAuthView(currentState);
  renderAdminView(currentState);
  renderBookingsView(currentState);
  renderBookingDetailView(currentState);
  renderInfoView(currentState);
  renderPaymentSuccessView(currentState);
  renderProfileView(currentState);
  renderRoomBookingView(currentState);
  renderRoomDetailView(currentState);
  renderRoomsView(currentState);
  renderStaffDirectoryView(currentState);
}

function initRevealAnimations() {
  const revealNodes = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!revealNodes.length) {
    return;
  }

  const stagedNodes = revealNodes.filter((node) => !node.dataset.reveal.startsWith("hero"));
  if (!stagedNodes.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    stagedNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  stagedNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 0.08, 0.28)}s`;
    observer.observe(node);
  });
}

function resetScopedData() {
  const requirements = currentRequirements();
  const patch = {};

  if (!requirements.rooms) {
    patch.rooms = [];
    patch.roomAvailabilityPreview = {};
    patch.roomAvailabilitySearch = {
      date: new Date().toISOString().slice(0, 10),
      time: "15:00",
      duration: 60,
      matchingRoomIds: [],
      hasSearched: false,
    };
    patch.showInactiveRooms = false;
  }
  if (!requirements.bookings) {
    patch.bookings = [];
    patch.availability = null;
  }
  if (!requirements.admin) {
    patch.adminBookings = [];
    patch.adminAnalytics = null;
    patch.adminActivity = [];
    patch.adminUsers = [];
    patch.adminTestCases = [];
    patch.adminStaffProfiles = [];
    patch.adminPromoCodes = [];
  }
  if (!requirements.publicStaff) {
    patch.publicStaffProfiles = [];
  }
  if (!requirements.selectedRoom) {
    patch.selectedRoom = null;
    patch.selectedRoomReviews = [];
    patch.selectedRoomReviewSummary = null;
  }
  if (!requirements.selectedBooking) {
    patch.selectedBooking = null;
    patch.selectedBookingKind = null;
    patch.selectedBookingReview = null;
  }

  if (Object.keys(patch).length) {
    setState(patch);
  }
}

async function loadHealth() {
  try {
    const health = await api.getHealth();
    setState({ health, message: "Backend connected." });
  } catch (error) {
    setState({ health: false, message: error.message });
  }
}

async function refreshRooms(message) {
  if (!currentRequirements().rooms) {
    return;
  }

  try {
    const shouldIncludeInactive = Boolean(
      state.currentUser?.is_admin && state.showInactiveRooms,
    );
    const rooms = await api.getRooms(shouldIncludeInactive);
    setState({ rooms, message: message || "Rooms loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshBookings(message) {
  if (!currentRequirements().bookings) {
    return;
  }

  if (!state.token) {
    setState({ bookings: [], availability: null, message: message || "Signed out." });
    return;
  }

  try {
    const bookings = await api.getBookingsFeed();
    setState({
      bookings: bookings.map((booking) => normalizeBookingRecord(booking)),
      message: message || "Bookings loaded.",
    });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminBookings(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminBookings: [], message: message || state.message });
    return;
  }

  try {
    const adminBookings = await api.adminLookupBookings({});
    setState({ adminBookings, message: message || "Admin bookings loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminAnalytics(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminAnalytics: null, message: message || state.message });
    return;
  }

  try {
    const adminAnalytics = await api.getAdminAnalyticsSummary();
    setState({ adminAnalytics, message: message || "Admin analytics loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminActivity(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminActivity: [], message: message || state.message });
    return;
  }

  try {
    const adminActivity = await api.getAdminActivity();
    setState({ adminActivity, message: message || "Admin activity loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminUsers(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminUsers: [], message: message || state.message });
    return;
  }

  try {
    const adminUsers = await api.getAdminUsers();
    setState({ adminUsers, message: message || "Accounts loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminTestCases(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminTestCases: [], message: message || state.message });
    return;
  }

  try {
    const adminTestCases = await api.getAdminTestCases();
    setState({ adminTestCases, message: message || "Backend test cases loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminStaffProfiles(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminStaffProfiles: [], message: message || state.message });
    return;
  }

  try {
    const adminStaffProfiles = await api.getAdminStaffProfiles();
    setState({ adminStaffProfiles, message: message || "Staff profiles loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshAdminPromoCodes(message) {
  if (!currentRequirements().admin) {
    return;
  }

  if (!state.currentUser?.is_admin) {
    setState({ adminPromoCodes: [], message: message || state.message });
    return;
  }

  try {
    const adminPromoCodes = await api.getAdminPromoCodes();
    setState({ adminPromoCodes, message: message || "Promo codes loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function refreshPublicStaffProfiles(message) {
  if (!currentRequirements().publicStaff) {
    return;
  }

  try {
    const publicStaffProfiles = await api.getPublicStaffProfiles();
    setState({ publicStaffProfiles, message: message || "Staff directory loaded." });
  } catch (error) {
    setState({ message: error.message });
  }
}

async function loadSelectedRoom(message) {
  if (!currentRequirements().selectedRoom) {
    return;
  }

  const roomId = getSearchParam("id");
  if (!roomId) {
    setState({ selectedRoom: null, message: "Room id is missing." });
    return;
  }

  try {
    const selectedRoom = await api.getRoom(roomId);
    const reviewFeed = await api.getRoomReviews(roomId).catch(() => ({
      summary: null,
      reviews: [],
    }));
    setState({
      selectedRoom,
      selectedRoomReviews: reviewFeed.reviews || [],
      selectedRoomReviewSummary: reviewFeed.summary || null,
      message: message || "Room loaded.",
    });
  } catch (error) {
    setState({
      selectedRoom: null,
      selectedRoomReviews: [],
      selectedRoomReviewSummary: null,
      message: error.message,
    });
  }
}

async function loadSelectedBooking(message) {
  if (!currentRequirements().selectedBooking) {
    return;
  }

  const explicitBookingId = getSearchParam("id");
  const requestedKind = String(getSearchParam("kind") || "").toLowerCase() || null;
  const persistedBookingId = getPersistedLastBookingId();
  const persistedCheckoutDraft = getPersistedCheckoutDraft();
  const checkoutDraftKind = String(persistedCheckoutDraft?.kind || persistedCheckoutDraft?.booking?.booking_kind || "").toLowerCase() || null;
  const bookingKind = requestedKind || checkoutDraftKind || null;

  let bookingId = explicitBookingId || persistedBookingId || persistedCheckoutDraft?.booking?.id;
  if (!bookingId && state.token) {
    try {
      const bookings = (await api.getBookingsFeed()).map((booking) => normalizeBookingRecord(booking));
      const prioritizedBooking =
        bookings.find((booking) => booking.status === "PendingPayment" && (!bookingKind || booking.booking_kind === bookingKind))
        || bookings.find((booking) => booking.status === "PendingPayment")
        || bookings.find((booking) => booking.status === "Paid" && (!bookingKind || booking.booking_kind === bookingKind))
        || bookings.find((booking) => booking.status === "Paid")
        || bookings[0];
      if (prioritizedBooking?.id) {
        bookingId = prioritizedBooking.id;
        persistLastBookingId(bookingId);
      }
    } catch (error) {
      setState({ message: error.message });
    }
  }

  if (!bookingId) {
    setState({
      selectedBooking: null,
      selectedBookingKind: bookingKind,
      message: "Start from Rooms or My Bookings to open the active checkout with the correct booking details.",
    });
    return;
  }

  if (!explicitBookingId) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("id", bookingId);
    if (bookingKind) {
      nextUrl.searchParams.set("kind", bookingKind);
    }
    window.history.replaceState({}, "", nextUrl);
  }

  try {
    const selectedBooking = normalizeBookingRecord(
      await api.getBookingByKind(bookingKind, bookingId),
      bookingKind,
    );
    const selectedBookingReview = await api.getBookingReview(bookingId).catch(() => null);
    persistLastBookingId(selectedBooking.id);
    if (selectedBooking.status !== "PendingPayment") {
      persistCheckoutDraft(null);
    } else {
      persistCheckoutDraft({ booking: selectedBooking, kind: selectedBooking.booking_kind });
    }
    setState({
      selectedBooking,
      selectedBookingKind: selectedBooking.booking_kind,
      selectedBookingReview,
      message: message || "Booking loaded.",
    });
  } catch (error) {
    if (!explicitBookingId && state.token) {
      try {
        const bookings = (await api.getBookingsFeed()).map((booking) => normalizeBookingRecord(booking));
        const fallbackBooking =
          bookings.find((booking) => booking.status === "PendingPayment" && (!bookingKind || booking.booking_kind === bookingKind))
          || bookings.find((booking) => booking.status === "PendingPayment")
          || bookings.find((booking) => booking.status === "Paid" && (!bookingKind || booking.booking_kind === bookingKind))
          || bookings.find((booking) => booking.status === "Paid")
          || bookings[0];
        if (fallbackBooking?.id && fallbackBooking.id !== bookingId) {
          persistLastBookingId(fallbackBooking.id);
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("id", fallbackBooking.id);
          if (fallbackBooking.booking_kind) {
            nextUrl.searchParams.set("kind", fallbackBooking.booking_kind);
          }
          window.history.replaceState({}, "", nextUrl);
          const selectedBooking = normalizeBookingRecord(
            await api.getBookingByKind(fallbackBooking.booking_kind, fallbackBooking.id),
            fallbackBooking.booking_kind,
          );
          const selectedBookingReview = await api.getBookingReview(fallbackBooking.id).catch(() => null);
          setState({
            selectedBooking,
            selectedBookingKind: selectedBooking.booking_kind,
            selectedBookingReview,
            message: message || "Booking loaded.",
          });
          return;
        }
      } catch (fallbackError) {
        setState({ message: fallbackError.message });
      }
    }

    if (
      persistedCheckoutDraft?.booking &&
      String(persistedCheckoutDraft.booking.id) === String(bookingId)
    ) {
      setState({
        selectedBooking: normalizeBookingRecord(
          persistedCheckoutDraft.booking,
          persistedCheckoutDraft.kind || bookingKind,
        ),
        selectedBookingKind: persistedCheckoutDraft.kind || bookingKind || persistedCheckoutDraft.booking.booking_kind || null,
        selectedBookingReview: null,
        message: "Checkout restored from your last booking.",
      });
      return;
    }

    setState({
      selectedBooking: null,
      selectedBookingKind: bookingKind,
      selectedBookingReview: null,
      message: error.message,
    });
  }
}

async function refreshAvailabilityAndBookings(message) {
  await refreshRooms(message);
  await refreshBookings(message);
  await refreshAdminBookings(message);
  await refreshAdminAnalytics(message);
  await refreshAdminActivity(message);
  await refreshAdminUsers(message);
  await refreshAdminTestCases(message);
  await refreshAdminStaffProfiles(message);
  await refreshAdminPromoCodes(message);
  await refreshPublicStaffProfiles(message);
  await loadSelectedBooking(message);

  if (!currentRequirements().bookings) {
    return;
  }

  const roomId = document.getElementById("booking-room-select")?.value;
  const date = document.getElementById("booking-date-input")?.value;
  if (!roomId || !date) {
    return;
  }

  try {
    const availability = await api.getAvailability(roomId, date);
    setState({ availability, message: message || "Booking state refreshed." });
  } catch (error) {
    setState({ availability: null, message: error.message });
  }
}

async function loadPageData(message) {
  const requirements = currentRequirements();

  if (requirements.rooms) {
    await refreshRooms(message || "Rooms ready.");
  }
  if (requirements.bookings) {
    await refreshBookings(message || "Bookings ready.");
  }
  if (requirements.admin) {
    await refreshAdminBookings(message || "Admin workspace ready.");
    await refreshAdminAnalytics(message || "Admin workspace ready.");
    await refreshAdminActivity(message || "Admin workspace ready.");
    await refreshAdminUsers(message || "Admin workspace ready.");
    await refreshAdminTestCases(message || "Admin workspace ready.");
    await refreshAdminStaffProfiles(message || "Admin workspace ready.");
    await refreshAdminPromoCodes(message || "Admin workspace ready.");
  }
  if (requirements.publicStaff) {
    await refreshPublicStaffProfiles(message || "Staff page ready.");
  }
  if (requirements.selectedRoom) {
    await loadSelectedRoom(message || "Room ready.");
  }
  if (requirements.selectedBooking) {
    await loadSelectedBooking(message || "Booking ready.");
  }
}

async function refreshSession(message) {
  resetScopedData();

  if (!state.token) {
    setState({ currentUser: null, message: message || "Signed out." });
    await loadPageData("Public view loaded.");
    return;
  }

  try {
    const currentUser = await api.getMe();
    setState({ currentUser, message: message || "Session restored." });
    await loadPageData("Session ready.");
  } catch (error) {
    persistToken(null);
    setState({
      currentUser: null,
      bookings: [],
      adminBookings: [],
      adminAnalytics: null,
      adminActivity: [],
      adminUsers: [],
      adminTestCases: [],
      adminStaffProfiles: [],
      adminPromoCodes: [],
      publicStaffProfiles: [],
      selectedRoom: null,
      selectedRoomReviews: [],
      selectedRoomReviewSummary: null,
      selectedBooking: null,
      selectedBookingKind: null,
      selectedBookingReview: null,
      availability: null,
      message: error.message,
    });
    await loadPageData("Token cleared.");
  }
}

async function clearSession() {
  setState({
    currentUser: null,
    bookings: [],
    adminBookings: [],
    adminAnalytics: null,
    adminActivity: [],
    adminUsers: [],
    adminTestCases: [],
    adminStaffProfiles: [],
    adminPromoCodes: [],
    publicStaffProfiles: [],
    selectedRoom: null,
    selectedRoomReviews: [],
    selectedRoomReviewSummary: null,
    selectedBooking: null,
    selectedBookingKind: null,
    selectedBookingReview: null,
    availability: null,
    message: "Signed out.",
  });
  await loadPageData("Public view loaded.");
}

subscribe(renderApp);

initAdminView({ refreshAll: refreshAvailabilityAndBookings, getState: () => state });
initAuthView({ refreshSession, clearSession });
initBookingsView({ refreshAvailabilityAndBookings });
initBookingDetailView({ reloadBookingDetail: loadSelectedBooking });
initHomeView();
initInfoView();
initPaymentSuccessView({ reloadPaymentSuccess: loadSelectedBooking });
initProfileView({ clearSession });
initRoomBookingView();
initRoomDetailView();
initRoomsView({ refreshRooms });
initStaffDirectoryView();

renderApp(state);
resetScopedData();
initRevealAnimations();
await loadHealth();
await refreshSession("Frontend ready.");
