import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Add them to your .env file.",
  );
}

/**
 * A second, fully independent Supabase client for the Client Hub
 * (/portal) — its own localStorage key means a client's magic-link session
 * and a contractor's own password-based session (src/lib/supabase.ts) can
 * never collide or overwrite each other in the same browser, even in the
 * same tab (e.g. a contractor previewing their own invite link while still
 * signed in as themselves elsewhere in the app). Same Supabase
 * project/database either way — only the session storage is separate.
 */
export const portalSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: "chq-portal-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // The magic-link email is requested by the portal-request-link Edge
    // Function, not by this browser client — so there's no client-side PKCE
    // code_verifier to redeem later (supabase-js's default flow). Implicit
    // flow puts the session tokens directly in the redirect's URL hash
    // instead, which any browser can consume without having been the one
    // that requested the link. Must match the anon client's flowType inside
    // that Edge Function.
    flowType: "implicit",
  },
});
