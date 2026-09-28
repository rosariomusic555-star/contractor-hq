// ContractorHQ — "Email to supplier" for a generated Order Sheet: sends the
// PDF as a real attachment through Resend (https://resend.com), then logs
// "Order sheet emailed to …" on the project's activity.
//
// Secrets (Supabase › Edge Functions › Secrets):
//   RESEND_API_KEY     — from resend.com › API Keys
//   ORDER_EMAIL_FROM   — a sender on a domain verified in Resend, e.g.
//                        "Clean Garden Landscaping <orders@cleangarden.com>"
// Replies go to the contractor: the Business Profile email, else their login.
//
// The caller's own JWT builds an RLS-scoped client (same pattern as
// create-employee / assistant-chat): it proves who's sending, that the
// project is theirs, and writes the activity row as them. No service role.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface SendRequest {
  projectId?: string;
  to?: string;
  supplierName?: string | null;
  subject?: string;
  message?: string;
  filename?: string;
  /** The PDF, base64 (no data: prefix). */
  pdfBase64?: string;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ORDER_EMAIL_FROM");
  if (!resendKey || !from) {
    return json(
      {
        ok: false,
        error: "not_configured",
        message: "Email sending isn't set up yet — add RESEND_API_KEY and ORDER_EMAIL_FROM in Supabase › Edge Functions › Secrets.",
      },
      503,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized", message: "Missing Authorization header." }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !apiKey) return json({ ok: false, error: "server_misconfigured", message: "Supabase URL/key not available to the function." }, 500);

  const db = createClient(supabaseUrl, apiKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized", message: "Your session isn't valid — try signing in again." }, 401);

  let body: SendRequest;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request", message: "Invalid request body." }, 400);
  }
  const to = body.to?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const message = body.message ?? "";
  const filename = (body.filename?.trim() || "order-sheet.pdf").replace(/[^\w.\- ]+/g, "_");
  if (!body.projectId) return json({ ok: false, error: "bad_request", message: "Missing project." }, 400);
  if (!EMAIL_RE.test(to)) return json({ ok: false, error: "bad_request", message: "That doesn't look like an email address." }, 400);
  if (!subject) return json({ ok: false, error: "bad_request", message: "Add a subject." }, 400);
  if (!body.pdfBase64) return json({ ok: false, error: "bad_request", message: "The order sheet PDF is missing." }, 400);
  if ((body.pdfBase64.length * 3) / 4 > MAX_PDF_BYTES) return json({ ok: false, error: "bad_request", message: "The PDF is too large to email." }, 400);

  // RLS: only the owner's own project is visible (employees can't see this).
  const { data: project } = await db.from("projects").select("id, name").eq("id", body.projectId).maybeSingle();
  if (!project) return json({ ok: false, error: "not_found", message: "Project not found." }, 404);

  const { data: profile } = await db.from("business_profile").select("company_name, email").maybeSingle();
  const replyTo = profile?.email?.trim() || user.email || undefined;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1D242E">${escapeHtml(message)
    .split(/\r?\n/)
    .join("<br>")}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: message,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      attachments: [{ filename, content: body.pdfBase64 }],
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (result as { message?: string }).message ?? `Resend returned ${res.status}.`;
    return json({ ok: false, error: "send_failed", message: `The email didn't send: ${detail}` }, 502);
  }

  const who = body.supplierName?.trim() ? `${body.supplierName.trim()} (${to})` : to;
  await db.from("project_events").insert({
    project_id: project.id,
    kind: "order_sheet_emailed",
    summary: `Order sheet emailed to ${who}`,
    meta: { to, supplier: body.supplierName ?? null, subject, filename, resend_id: (result as { id?: string }).id ?? null },
  });

  return json({ ok: true, id: (result as { id?: string }).id ?? null });
});
