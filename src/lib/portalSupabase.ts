import { createClient } from "@supabase/supabase-js";
import { isPortalPath } from "./supabase";
// Evaluated first: snapshots the landing URL before supabase-js consumes its hash.
import "./portalLinks";

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
    // Only on /portal (where magic links land) — never a contractor's own
    // auth redirect elsewhere in the app. See isPortalPath() in supabase.ts.
    detectSessionInUrl: isPortalPath(),
    // Links are requested by the portal-request-link Edge Function or the
    // contractor's browser (invites), never by the browser that redeems them
    // — so no PKCE (its code verifier would be missing). Current links carry
    // a token_hash verified on /portal/auth/confirm (see portalLinks.ts);
    // implicit only matters for older #access_token links. Must match the
    // anon client's flowType inside that Edge Function.
    flowType: "implicit",
  },
});
