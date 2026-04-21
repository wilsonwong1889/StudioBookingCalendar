import { elements } from "../dom.js?v=20260421a";

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "CAD",
  }).format((cents || 0) / 100);
}

function formatDuration(minutes) {
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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

function renderRoomStaffList(room) {
  if (!elements.roomDetailStaffList) {
    return;
  }

  const staffRoles = room.staff_roles || [];
  elements.roomDetailStaffList.innerHTML = staffRoles.length
    ? staffRoles
        .map(
          (role) => `
            <article class="staff-profile-card">
              <div class="staff-profile-card-top">
                ${renderStaffImage(role.photo_url, role.name)}
                <div class="staff-option-copy">
                  <strong>${role.name}</strong>
                  <span>${role.description || "Available as an optional add-on for this room."}</span>
                </div>
              </div>
              <strong class="staff-option-price">${formatCurrency(role.add_on_price_cents)} add-on</strong>
              <div class="staff-option-copy">
                ${renderTagGroup("Skills", role.skills || [])}
                ${renderTagGroup("Talents", role.talents || [])}
              </div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">This room does not have extra staff add-ons configured yet.</div>';
}

function renderRoomReviews(currentState) {
  if (!elements.roomDetailReviewsSummary || !elements.roomDetailReviewsList) {
    return;
  }

  const summary = currentState.selectedRoomReviewSummary;
  const reviews = currentState.selectedRoomReviews || [];
  if (!summary || !summary.review_count) {
    elements.roomDetailReviewsSummary.textContent =
      "No public reviews yet. Completed sessions can add ratings here once the room has hosted guests.";
    elements.roomDetailReviewsList.innerHTML =
      '<div class="empty-state">The first finished session review will appear here.</div>';
    return;
  }

  const averageLabel =
    typeof summary.average_rating === "number" ? summary.average_rating.toFixed(1) : summary.average_rating;
  elements.roomDetailReviewsSummary.textContent = `${averageLabel}/5 from ${summary.review_count} review${summary.review_count === 1 ? "" : "s"}.`;
  elements.roomDetailReviewsList.innerHTML = reviews.length
    ? reviews
        .map(
          (review) => `
            <article class="review-card">
              <div class="review-card-top">
                <strong>${review.reviewer_name || "Guest"}</strong>
                <span class="pill">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
              </div>
              <p>${review.comment || "Rated this room without a written comment."}</p>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">Review summary is available, but no recent comments were returned.</div>';
}

export function initRoomDetailView() {}

export function renderRoomDetailView(state) {
  if (!elements.roomDetailEmpty || !elements.roomDetailCard) {
    return;
  }

  const room = state.selectedRoom;
  const hasRoom = Boolean(room);
  elements.roomDetailEmpty.classList.toggle("hidden", hasRoom);
  elements.roomDetailCard.classList.toggle("hidden", !hasRoom);

  if (!room) {
    return;
  }

  elements.roomDetailTitle.textContent = room.name;
  elements.roomDetailDescription.textContent = room.description || "No description available yet.";
  elements.roomDetailMeta.innerHTML = `
    <span class="pill">${formatCurrency(room.hourly_rate_cents)}/hour CAD</span>
    <span class="pill">Max ${formatDuration(room.max_booking_duration_minutes || 300)}</span>
    <span class="pill">Capacity ${room.capacity || "n/a"}</span>
    <span class="pill">${(room.staff_roles || []).length} staff profile${(room.staff_roles || []).length === 1 ? "" : "s"} available</span>
    <span class="pill ${room.active ? "" : "muted"}">${room.active ? "Active" : "Inactive"}</span>
  `;
  renderRoomStaffList(room);
  renderRoomReviews(state);

  const photos = Array.isArray(room.photos) ? room.photos : [];
  elements.roomDetailPhotos.innerHTML = photos.length
    ? photos
        .map(
          (photo, index) => `
            <figure class="media-card">
              <img class="detail-image" src="${photo}" alt="${room.name} image ${index + 1}" loading="lazy" />
              <figcaption>Image ${index + 1}</figcaption>
            </figure>
          `,
        )
        .join("")
    : '<div class="empty-state">No room images were added for this room yet.</div>';

  if (elements.roomDetailBookingLink) {
    elements.roomDetailBookingLink.href = `/bookings?room=${room.id}`;
  }
}
