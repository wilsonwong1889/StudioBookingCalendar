import { elements } from "../dom.js?v=20260401r";

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

function renderFounderCard(founder) {
  return `
    <article class="staff-profile-card">
      <div class="staff-profile-card-top">
        <img
          class="staff-profile-image"
          src="${STAFF_PLACEHOLDER_IMAGE}"
          alt="${founder.name}"
          loading="lazy"
        />
        <div class="staff-option-copy">
          <strong>${founder.name}</strong>
          <span>${founder.role}</span>
        </div>
      </div>
      <p>${founder.summary}</p>
    </article>
  `;
}

function renderStaffImage(photoUrl, label) {
  const source = photoUrl || STAFF_PLACEHOLDER_IMAGE;
  return `<img class="staff-profile-image" src="${source}" alt="${label}" loading="lazy" />`;
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

function renderStaffCard(profile) {
  return `
    <article class="staff-profile-card">
      <div class="staff-profile-card-top">
        ${renderStaffImage(profile.photo_url, profile.name)}
        <div class="staff-option-copy">
          <strong>${profile.name}</strong>
          <span>${profile.description || "Studio staff profile."}</span>
        </div>
      </div>
      <div class="room-meta">
        <span class="pill">$${(profile.add_on_price_cents / 100).toFixed(2)} add-on</span>
      </div>
      ${renderTagGroup("Skills", profile.skills || [])}
      ${renderTagGroup("Talents", profile.talents || [])}
    </article>
  `;
}

export function initStaffDirectoryView() {}

export function renderStaffDirectoryView(currentState) {
  if (elements.staffFoundersGrid) {
    elements.staffFoundersGrid.innerHTML = FOUNDERS.map(renderFounderCard).join("");
  }

  if (elements.staffTeamGrid) {
    const profiles = currentState.publicStaffProfiles || [];
    elements.staffTeamGrid.innerHTML = profiles.length
      ? profiles.map(renderStaffCard).join("")
      : '<div class="empty-state">No public staff profiles yet. Add active staff profiles in admin to show them here.</div>';
  }
}
