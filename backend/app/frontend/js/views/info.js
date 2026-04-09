import { elements } from "../dom.js?v=20260401r";

const FOUNDERS = [
  {
    name: "Creative Founder",
    role: "Founder / Creative Direction",
    summary: "Built the studio around clean production flow, artist comfort, and a booking experience that feels simple from the first click to final session delivery.",
  },
  {
    name: "Operations Founder",
    role: "Founder / Operations",
    summary: "Leads scheduling, guest experience, room readiness, and the operational systems that keep recording, meetings, and production sessions running on time.",
  },
];

const BUILDING_GALLERY = [
  {
    title: "Full building exterior",
    image: "/assets/media/studio-building-exterior.jpg",
    copy: "A dedicated place for your outside building photo so clients know what to look for on arrival.",
  },
  {
    title: "Lobby and reception",
    image: "/assets/media/studio-building-lobby.svg",
    copy: "Use this image area for your front desk, waiting lounge, or guest entry experience.",
  },
  {
    title: "Signature studio room",
    image: "/assets/media/studio-building-signature-room.svg",
    copy: "Use this feature slot for the room, hallway, or branded corner that best captures the overall studio atmosphere.",
  },
];

function renderFounderCard(founder) {
  return `
    <article class="staff-profile-card">
      <div class="staff-profile-card-top">
        <div class="staff-profile-image staff-avatar-fallback">${founder.name.slice(0, 1).toUpperCase()}</div>
        <div class="staff-option-copy">
          <strong>${founder.name}</strong>
          <span>${founder.role}</span>
        </div>
      </div>
      <p>${founder.summary}</p>
    </article>
  `;
}

function renderBuildingCard(item) {
  return `
    <article class="room-card room-card-rich building-gallery-card">
      <div class="room-card-media">
        <img class="room-card-image" src="${item.image}" alt="${item.title}" loading="lazy" />
      </div>
      <div class="room-card-top">
        <div>
          <h3>${item.title}</h3>
          <p>${item.copy}</p>
        </div>
      </div>
    </article>
  `;
}

export function initInfoView() {}

export function renderInfoView() {
  if (elements.infoFoundersGrid) {
    elements.infoFoundersGrid.innerHTML = FOUNDERS.map(renderFounderCard).join("");
  }
  if (elements.infoBuildingGallery) {
    elements.infoBuildingGallery.innerHTML = BUILDING_GALLERY.map(renderBuildingCard).join("");
  }
}
