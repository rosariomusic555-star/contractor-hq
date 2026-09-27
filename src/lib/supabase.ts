import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Add them to your .env file.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Never on /portal: a client's magic link lands there with its tokens
    // in the URL, and picking them up here would sign the contractor's own
    // app in as the client (replacing their session in this browser).
    detectSessionInUrl: !isPortalPath(),
  },
});

/** The Client Hub's routes — their URL sessions belong to portalSupabase. */
export function isPortalPath(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/portal");
}
