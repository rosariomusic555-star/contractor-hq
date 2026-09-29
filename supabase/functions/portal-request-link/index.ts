// ContractorHQ — Client Hub (Phase 1): the privacy gate in front of
// Supabase's own passwordless magic-link (OTP) email. Called from the
// public /portal sign-in page — there is no signed-in caller at all yet
// (this IS the sign-in request).
//
// Why this needs a function instead of calling
// portalSupabase.auth.signInWithOtp() straight from the browser: doing that
// directly would (a) let anyone request — and receive — a real magic link
// for ANY email, matching a client or not, and (b) risk Supabase's own
// response shape/timing revealing whether that email exists as a client,
// which the product spec explicitly forbids ("never reveal whether an
// email exists"). This function always returns the same generic response;
// only when the email actually matches a client record does it go on to
// trigger the real OTP send.
//
// Two clients, same "step up only when needed" shape as create-employee:
// 1. A service-role client — the only way to check `clients.email` across
//    every contractor without an RLS policy that would otherwise have to
//    let anonymous callers read the clients table (never acceptable).
// 2. The anon-key client — used only for the actual signInWithOtp() call,
//    the normal public entry point to Supabase Auth's own email sending.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Same response every time — match or not, rate-limited or not. That's the
// whole point of this function.
const GENERIC_RESPONSE = {
  ok: true,
  message: "If that email matches an account, a sign-in link is on its way.",
};

const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 8;

/** Escapes LIKE/ILIKE special characters so an email containing `%` or `_`
 * can't be used as a wildcard pattern — this must behave as an exact,
 * case-insensitive match, nothing looser. */
function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

interface PortalRequestLinkBody {
  email?: string;
  redirectTo?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  let body: PortalRequestLinkBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ ok: false, error: "bad_request", message: "Enter a valid email address." }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Log the attempt first (used purely for rate limiting, never read back
  // for anything else) — done before the match check so a flood of
  // requests for non-existent emails is throttled too, not just real ones.
  await adminClient.from("portal_link_requests").insert({ email, ip_address: ip });

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
    adminClient
      .from("portal_link_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since),
    adminClient
      .from("portal_link_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", since),
  ]);
  if ((emailCount ?? 0) > MAX_PER_EMAIL || (ipCount ?? 0) > MAX_PER_IP) {
    // Still the generic response — rate-limited and "no such email" must
    // stay indistinguishable from the outside.
    return json(GENERIC_RESPONSE);
  }

  const { data: matches } = await adminClient
    .from("clients")
    .select("id")
    .ilike("email", escapeForIlike(email))
    .limit(1);

  if (matches && matches.length > 0) {
    // flowType: "implicit" — this client requests the link but will never
    // be the one that redeems it (a browser, minutes later, is). Default
    // PKCE would embed a code_verifier only this ephemeral client instance
    // ever had, making the link unredeemable by anyone. Implicit puts the
    // session tokens straight in the redirect's URL hash instead, so any
    // browser can consume it. Must match portalSupabase's own flowType.
    const anonClient = createClient(supabaseUrl, anonKey, { auth: { flowType: "implicit" } });
    await anonClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: body.redirectTo,
        // Only applied when this creates the login: a Client Hub account, so
        // the sign-up seed triggers (0146) skip the contractor defaults.
        data: { account_type: "client" },
      },
    });
  }

  return json(GENERIC_RESPONSE);
});
