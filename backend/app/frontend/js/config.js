export const STORAGE_KEYS = {
  token: "studio-booking-token",
  profileDraftPrefix: "studio-booking-profile-draft",
};

export const API_BASE_URL = "";

export const CURRENT_PAGE = document.body?.dataset.page || "home";

export const SEARCH_PARAMS = new URLSearchParams(window.location.search);

export function getSearchParam(name) {
  return SEARCH_PARAMS.get(name);
}
