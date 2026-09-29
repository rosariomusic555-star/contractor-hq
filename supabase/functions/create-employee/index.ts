// ContractorHQ — Employee-Only Mode: the one privileged operation this
// feature needs (creating an employee's Supabase Auth login with an
// owner-chosen password), isolated to its own Edge Function so the
// service-role key it requires never touches the browser bundle or any
// other function.
//
// Security model, two clients used in careful order:
// 1. An RLS-scoped client built from the CALLER's own JWT (never the
//    service-role key) — identifies the caller and confirms they're an
//    owner, not themselves an employee. Same pattern as
//    assistant-chat/index.ts's own client construction.
// 2. Only after that check passes, a second client built from
//    SUPABASE_SERVICE_ROLE_KEY (auto-provided to every Edge Function,
//    nothing to configure) — used only for auth.admin.createUser, the one
//    thing an RLS-scoped client can never do on its own (there's no RLS
//    policy for "create another user's login" — it's an admin-API
//    operation by design).
// Who may call it, and for which email, is decided in ./authorize.ts
// (unit-tested): the business owner only (not anonymous, not an employee,
// not a Client Hub / magic-link session, not someone else's client), and
// never for an email that belongs to a client.
// The employees row itself is inserted through the RLS-scoped client, not
// the service client, so owner_user_id's `default auth.uid()` fires
// naturally — same convention as every owner-scoped insert elsewhere.

import { createClient } from "@supabase/supabase-js";
import { amrMethodsOf, authorizeCreateEmployee, jwtPayloadOf } from "./authorize.ts";

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

/** Exact, case-insensitive match for ILIKE — `%` and `_` in an email are literal. */
function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

interface CreateEmployeeRequest {
  name?: string;
  email?: string;
  password?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, error: "unauthorized", message: "Missing Authorization header." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKeyHeader =
    req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !apiKeyHeader) {
    return json(
      { ok: false, error: "server_misconfigured", message: "Supabase URL/key not available to the function." },
      500,
    );
  }
  if (!serviceRoleKey) {
    return json(
      { ok: false, error: "server_misconfigured", message: "Service role key not available to the function." },
      500,
    );
  }

  // 1. Identify the caller via their own RLS-scoped client.
  const callerClient = createClient(supabaseUrl, apiKeyHeader, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return json({ ok: false, error: "unauthorized", message: "Your session isn't valid — try signing in again." }, 401);
  }

  // Only an owner may create employees — an employee account must never
  // be able to create another one.
  const { data: existingEmployeeRow, error: employeeCheckError } = await callerClient
    .from("employees")
    .select("id")
    .eq("auth_user_id", caller.id)
    .maybeSingle();
  if (employeeCheckError) {
    return json({ ok: false, error: "server_error", message: employeeCheckError.message }, 500);
  }
  // The service-role client is needed to see clients across every business
  // (a caller's RLS only shows their own) — used for lookups here and the
  // login creation below, nothing else.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const clientWithEmail = async (email: string) => {
    const { data, error } = await adminClient
      .from("clients")
      .select("id, user_id")
      .ilike("email", escapeForIlike(email.trim()))
      .limit(20);
    if (error) throw error;
    return data ?? [];
  };

  let callerClientRows: { id: string; user_id: string }[] = [];
  try {
    callerClientRows = caller.email ? await clientWithEmail(caller.email) : [];
  } catch (e) {
    return json({ ok: false, error: "server_error", message: (e as Error).message }, 500);
  }
  const callerFacts = {
    userId: caller.id,
    email: caller.email ?? null,
    amrMethods: amrMethodsOf(jwtPayloadOf(authHeader)),
    isEmployee: !!existingEmployeeRow,
    isClientOfAnotherBusiness: callerClientRows.some((c) => c.user_id !== caller.id),
  };
  const callerDecision = authorizeCreateEmployee(callerFacts, null);
  if (!callerDecision.ok) return json({ ok: false, error: callerDecision.error, message: callerDecision.message }, callerDecision.status);

  let body: CreateEmployeeRequest;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request", message: "Invalid JSON body." }, 400);
  }
  const name = body.name?.trim();
  const email = body.email?.trim();
  const password = body.password;
  if (!name || !email || !password) {
    return json({ ok: false, error: "bad_request", message: "name, email, and password are all required." }, 400);
  }
  if (password.length < 6) {
    return json({ ok: false, error: "bad_request", message: "Password must be at least 6 characters." }, 400);
  }

  // Never for a client's email — that login would look like the client to the Client Hub.
  let targetClientRows: { id: string; user_id: string }[] = [];
  try {
    targetClientRows = await clientWithEmail(email);
  } catch (e) {
    return json({ ok: false, error: "server_error", message: (e as Error).message }, 500);
  }
  const decision = authorizeCreateEmployee(callerFacts, { email, belongsToAClient: targetClientRows.length > 0 });
  if (!decision.ok) return json({ ok: false, error: decision.error, message: decision.message }, decision.status);

  // 2. Create the login — the one operation an RLS-scoped client can never do.
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Tells the sign-up seed triggers (0146) this isn't a contractor account —
    // no default categories / lead sources for a crew login.
    user_metadata: { account_type: "employee" },
  });
  if (createError || !created.user) {
    return json(
      { ok: false, error: "create_user_failed", message: createError?.message ?? "Could not create the login." },
      400,
    );
  }

  // Insert through the CALLER's own RLS-scoped client — owner_user_id
  // defaults to auth.uid() at the DB level, so it's always correct
  // without this function ever having to name it.
  const { data: employee, error: insertError } = await callerClient
    .from("employees")
    .insert({ auth_user_id: created.user.id, name, email })
    .select()
    .single();

  if (insertError) {
    // Don't leave an orphaned login behind if the row insert failed.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ ok: false, error: "server_error", message: insertError.message }, 500);
  }

  return json({ ok: true, employee });
});
