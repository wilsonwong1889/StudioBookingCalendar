// Funders & partners acknowledgement — the spinning logo strip and the
// matching "thank you" cards on /partners.
//
// Both are rendered from ONE list (PARTNERS, directly below). Edit that list
// and the marquee, the cards, and the scroll speed all follow. Nothing else in
// this file needs touching to add, remove, or reorder an organisation.
//
// Dropping the strip onto another page takes one line of markup:
//     <div data-partner-marquee-mount></div>
//     <div data-partner-acknowledgements-mount></div>
// `initPartners()` runs from main.js on every page, so a mount point added to
// index.html (or anywhere else) is picked up with no further wiring.

/* ════════════════════════════════════════════════════════════════════════
   FUNDER LIST — five organisations, per the 6 Oct 2026 meeting summary.

   The earlier "six names but five in total" discrepancy is resolved. The
   summary names the funders as "City of Lethbridge, Community Foundations
   and Government of Alberta NRED Program", then adds "Arts Marvels and
   BIPOC Foundation" — five. The count only looked like six because
   "Government of Alberta NRED Program" had been split into two entries,
   and because the notes' "Oilsmarble" was a mis-transcription of Arts
   Marvels.

   Still subject to confirmation, in the summary's own words: the formal
   names, which "were unclear in the recording". Specifically, which
   Community Foundations, and what NRED stands for — do not expand the
   acronym on the page until someone confirms it.

   Every `note` below claims support for the Hub and nothing more. No
   funding amounts, grant names, or terms are asserted, because none were
   verified.

   EDITING THIS LIST
     name   Required. Shown as-is, and used for the fallback tile.
     url    Official website, or "" for none. Only verified URLs belong here.
     logo   Path to the logo image, or "" for none. Entries below are ""
            because no logo file has been supplied yet: an src pointing at
            a file that is not there still renders the name tile, but costs a
            404 on every page load — so leave it "" until the file exists.
            New funder logos go in /assets/media/partners/ (create the
            folder); drop the file in and set this to its path. Prefer a
            tile-sized image (~192px wide, as in /assets/media/links/) over a
            full-resolution one — a tile never renders wider than ~175px.
            If a path is ever wrong, the tile falls back to the name anyway.
     note   One short line of appreciation/context. Keep it generic unless the
            relationship has been confirmed in writing.
   ════════════════════════════════════════════════════════════════════════ */
export const PARTNERS = [
  {
    name: "City of Lethbridge",
    // Verified 2026-10-21: resolves to "Home | City of Lethbridge".
    url: "https://www.lethbridge.ca/",
    logo: "",
    note: "Thank you to the City of Lethbridge for supporting creative space and community access here at home.",
  },
  {
    // One funder, not two: the 6 Oct 2026 summary names it "Government of
    // Alberta NRED Program". Splitting it was what made five look like six.
    // The acronym is left unexpanded on purpose — nobody has confirmed it.
    // URL is the province's own; the programme's page is not confirmed.
    name: "Government of Alberta NRED Program",
    url: "https://www.alberta.ca/",
    logo: "",
    note: "Thank you to the Government of Alberta NRED Program for supporting creative and economic opportunity across the province.",
  },
  {
    // TODO(confirm): which Community Foundations? The 6 Oct 2026 summary
    // writes it plural but names no specific foundation, and flags that
    // formal names were unclear in the recording. Confirm name and URL.
    name: "Community Foundations",
    url: "",
    logo: "",
    note: "Thank you for the community investment that helps keep the Hub open and accessible.",
  },
  {
    // "Oilsmarble" in the meeting notes was a mis-transcription of Arts Marvels
    // (confirmed by the user 2026-10-21). Logo and link are the site's own:
    // Instagram is the only Arts Marvels URL the site uses, in 45 places, and
    // the logo file is already in the repo — so this entry costs no 404.
    name: "Arts Marvels",
    url: "https://www.instagram.com/artsmarvels/",
    logo: "/assets/media/links/logo-arts-marvels.png",
    note: "Arts Marvels powers the Hub day to day, turning studio space into programming, production, and opportunity for the community.",
  },
  {
    name: "BIPOC Foundation",
    url: "https://bipocfoundation.org/",
    logo: "/assets/media/links/logo-bipoc-foundation.png",
    note: "The Hub is powered by BIPOC Foundation, whose mission for economic empowerment, access, and representation shapes everything we do here.",
  },
];
/* ═══════════════════ end of the editable funder list ════════════════════ */

// Seconds of travel per tile. The duration scales with the number of tiles so
// the strip moves at the same speed whether there are three logos or twelve.
const SECONDS_PER_TILE = 6;
const MIN_DURATION_SECONDS = 24;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function usablePartners() {
  return PARTNERS.filter((partner) => partner && partner.name);
}

// A tile shows the logo when one is configured and loads; otherwise it shows
// the organisation's name set in type. `.has-logo` is optimistic — the image
// is assumed good so a present logo never flashes its name first — and
// `bindLogoFallbacks()` takes it back off if the file turns out to be missing.
//
// Deliberately NOT loading="lazy": the name fallback hangs off the image's
// error event, and a lazy image that is off-screen (the whole duplicate run,
// for one) is never fetched, so it never errors — the tile would scroll into
// view empty and only then pop to the name. Logos are small; load them.
function renderTile(partner, { duplicate }) {
  const name = escapeHtml(partner.name);
  const hasLogo = Boolean(partner.logo);
  const slot = `
          <span class="partner-logo-slot${hasLogo ? " has-logo" : ""}" data-partner-logo-slot>
            ${hasLogo ? `<img class="partner-logo" src="${escapeHtml(partner.logo)}" alt="${name}" decoding="async" data-partner-logo />` : ""}
            <span class="partner-logo-name">${name}</span>
          </span>`;

  // The duplicate run exists only to make the loop seamless, so it is hidden
  // from assistive tech and taken out of the tab order.
  const linkAttrs = duplicate ? ' tabindex="-1" aria-hidden="true"' : "";

  const inner = partner.url
    ? `<a class="partner-tile-inner" href="${escapeHtml(partner.url)}" target="_blank" rel="noreferrer"${linkAttrs}>${slot}
          </a>`
    : `<span class="partner-tile-inner">${slot}
          </span>`;

  return `
        <li class="partner-tile">
          ${inner}
        </li>`;
}

function renderRun(partners, { duplicate }) {
  return `
      <ul class="partner-marquee-run"${duplicate ? ' aria-hidden="true"' : ""}>
        ${partners.map((partner) => renderTile(partner, { duplicate })).join("")}
      </ul>`;
}

/**
 * The continuously scrolling logo strip.
 *
 * The track holds exactly two identical runs and slides by -50%, so the moment
 * run one leaves the viewport run two is sitting pixel-for-pixel where it
 * started — the loop has no visible seam. Each run carries its own trailing
 * gap (rather than the track using `gap`) so both runs are exactly the same
 * width and -50% really is one full run.
 */
export function renderPartnerMarquee(options = {}) {
  const { label = "Funders and partners of the Hub" } = options;
  const partners = usablePartners();
  if (!partners.length) return "";

  return `
    <div class="partner-marquee" data-partner-marquee role="group" aria-label="${escapeHtml(label)}">
      <div class="partner-marquee-viewport">
        <div class="partner-marquee-track" data-partner-marquee-track>
          ${renderRun(partners, { duplicate: false })}
          ${renderRun(partners, { duplicate: true })}
        </div>
      </div>
    </div>`;
}

/** The acknowledgement cards: name, a line of context, and a link out. */
export function renderPartnerAcknowledgements() {
  const partners = usablePartners();
  if (!partners.length) return "";

  const cards = partners
    .map((partner) => {
      const name = escapeHtml(partner.name);
      const hasLogo = Boolean(partner.logo);
      const link = partner.url
        ? `
          <a class="ghost-button ghost-link card-bottom-action" href="${escapeHtml(partner.url)}" target="_blank" rel="noreferrer">Visit ${name} &#8599;</a>`
        : "";

      // No name tile here: the heading right below already names the
      // organisation, so a logo-less card simply drops the mark rather than
      // printing the name twice. The CSS hides an emptied mark too, for when a
      // logo file turns out to be missing.
      const mark = hasLogo
        ? `
          <div class="partner-card-mark">
            <span class="partner-logo-slot has-logo" data-partner-logo-slot>
              <img class="partner-logo" src="${escapeHtml(partner.logo)}" alt="" decoding="async" data-partner-logo />
            </span>
          </div>`
        : "";

      return `
        <article class="home-collab-org-card partner-card">${mark}
          <h3>${name}</h3>
          <p>${escapeHtml(partner.note || "")}</p>${link}
        </article>`;
    })
    .join("");

  return `
      <div class="home-collab-grid responsive-card-grid-3 partner-card-grid">${cards}
      </div>`;
}

// A logo path that 404s must not leave an empty tile behind. Swap back to the
// name the moment the browser tells us the image failed — so logo files can be
// added later with no code change, and a typo'd path degrades instead of
// breaking the strip.
function bindLogoFallbacks(root) {
  root.querySelectorAll("[data-partner-logo]").forEach((image) => {
    const slot = image.closest("[data-partner-logo-slot]");
    if (!slot) return;

    const fallBackToName = () => {
      slot.classList.remove("has-logo");
      image.remove();
    };

    // An image that already finished loading fires no further events, so a
    // cached failure has to be caught by inspection rather than by listener.
    if (image.complete) {
      if (image.naturalWidth === 0) fallBackToName();
      return;
    }
    image.addEventListener("error", fallBackToName, { once: true });
  });
}

function mount(selector, html) {
  const hosts = document.querySelectorAll(selector);
  hosts.forEach((host) => {
    if (host.dataset.partnersRendered === "true") return;
    host.dataset.partnersRendered = "true";
    // Replaces the static no-JS fallback that lives inside the mount point.
    host.innerHTML = html;
    bindLogoFallbacks(host);

    const track = host.querySelector("[data-partner-marquee-track]");
    if (track) {
      const seconds = Math.max(MIN_DURATION_SECONDS, usablePartners().length * SECONDS_PER_TILE);
      track.style.setProperty("--partner-marquee-duration", `${seconds}s`);
    }
  });
}

/** Render every partner mount point on the current page. Safe to call anywhere. */
export function initPartners() {
  if (!usablePartners().length) return;
  mount("[data-partner-marquee-mount]", renderPartnerMarquee());
  mount("[data-partner-acknowledgements-mount]", renderPartnerAcknowledgements());
}
