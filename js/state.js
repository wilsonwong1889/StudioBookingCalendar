import { STORAGE_KEYS } from "./config.js?v=20260401r";

const listeners = new Set();

export const state = {
  token: localStorage.getItem(STORAGE_KEYS.token),
  currentUser: null,
  rooms: [],
  roomAvailabilityPreview: {},
  roomPreviewDate: new Date().toISOString().slice(0, 10),
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
  selectedBooking: null,
  availability: null,
  health: null,
  showInactiveRooms: false,
  message: "Frontend booting.",
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener(state));
}

export function persistToken(token) {
  if (token) {
    localStorage.setItem(STORAGE_KEYS.token, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.token);
  }
  setState({ token });
}
