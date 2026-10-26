let publicConfigPromise = null;
let supabaseClientPromise = null;

async function loadPublicConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = fetch("/api/public/config")
      .then((response) => response.json())
      .catch(() => ({}));
  }
  return publicConfigPromise;
}

/**
 * Mark the page with the booking mode so CSS can hide payment-only furniture.
 *
 * Driven off a body attribute rather than a render-time check because the
 * summary panel re-renders on every date/time change and the config arrives
 * asynchronously — an attribute applies whenever it lands, to whatever is on
 * screen, with no ordering to get wrong.
 */
export async function applyBookingMode() {
  const config = await loadPublicConfig();
  const mode = config?.booking_mode || "payment";
  document.body.dataset.bookingMode = mode;
  if (mode === "reserve") {
    // Nothing is paid online, so the last step confirms rather than checks out.
    document.querySelectorAll("[data-reserve-step] strong, [data-staff-step] strong").forEach((el) => {
      if (el.textContent.trim().toLowerCase() === "checkout") {
        el.textContent = "Confirm";
      }
    });
  }
  return mode;
}

export async function hasSupabaseConfig() {
  const config = await loadPublicConfig();
  return Boolean(config?.supabase_url && config?.supabase_publishable_key);
}

export async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const config = await loadPublicConfig();
      if (!config?.supabase_url || !config?.supabase_publishable_key) {
        return null;
      }
      // Vendored rather than fetched from esm.sh: sign-in should not depend
      // on a third-party CDN being up at the moment someone clicks the button.
      const { createClient } = await import("/assets/js/vendor/supabase-js-2.114.0.js");
      return createClient(config.supabase_url, config.supabase_publishable_key, {
        auth: {
          storage: window.localStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    })();
  }

  return supabaseClientPromise;
}

export async function startGoogleSignIn() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error("Google sign-in is not configured yet.");
  }

  // Carry a same-site ?next= target through the OAuth round-trip. The "create
  // your engineer profile" flow links to /account?...&next=/staff-dashboard;
  // without this, Google's redirect drops next and finalizeGoogleSignIn sends
  // people to the home page / regular profile instead of the staff dashboard.
  let redirectTo = `${window.location.origin}/account?mode=login&google_auth=1`;
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    redirectTo += `&next=${encodeURIComponent(next)}`;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw error;
  }
}

export async function exchangeSupabaseSession() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

export async function signOutSupabase() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}
