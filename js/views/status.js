import { elements } from "../dom.js";

export function renderStatus(state) {
  if (elements.appMessage) {
    elements.appMessage.textContent = state.message || "Ready.";
  }
}
