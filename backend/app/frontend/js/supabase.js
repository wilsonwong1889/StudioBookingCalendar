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
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
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

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/account?mode=login&google_auth=1`,
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
