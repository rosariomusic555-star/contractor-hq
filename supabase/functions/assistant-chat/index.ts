// ContractorHQ AI assistant — read-only chat over the signed-in user's own
// business data. See supabase/functions/assistant-chat/tools.ts for the
// tool definitions/dispatch and format.ts for the shared math.
//
// Security model: every DB query in this function runs through a Supabase
// client built from the CALLING USER's own JWT (never the service-role
// key), so Postgres RLS — the same "own" policies used everywhere else in
// this app — is the actual enforcement. Nothing in the request body or in
// any tool's input schema carries a user_id, so there is no way for a
// question to name another user's data even in principle. The platform
// also verifies the JWT before this function runs at all (config.toml:
// verify_jwt = true); the auth.getUser() call below is a second, explicit
// check on top of that.

import { createClient } from "@supabase/supabase-js";
import { callTool, TOOLS } from "./tools.ts";

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

// One line per question asked (timestamp only — see migration 0029), used
// to enforce this per-user daily cap. Adjust freely; it's just a constant.
const DAILY_MESSAGE_LIMIT = 50;
// Only the last N messages of the visible thread are sent to the model,
// regardless of how long the conversation looks in the UI — bounds cost on
// long-running conversations.
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 2000;
// Hard cap on tool-call round trips per question, so one confused loop
// can't run away.
const MAX_TOOL_ITERATIONS = 5;
const MAX_RESPONSE_TOKENS = 1024;

// A single named constant — bump this one line to move to a newer model.
const ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const systemPrompt = (todayIso: string) => `You are a read-only assistant built into ContractorHQ, a business-management app for a solo/small contracting business. You can only READ the current user's own data through the tools provided — you cannot create, edit, or delete anything, and must never claim to have made a change.

Rules:
- Always use a tool to look up real numbers or records rather than guessing or estimating. Never fabricate project names, amounts, or dates.
- All amounts returned by tools are plain numbers in US dollars — format them as currency in your answer (e.g. $1,234.56).
- Plain text only — the chat UI does not render markdown, so never use **bold**, #headings, or [links](url). A leading "- " for a short list is fine; anything else should just be plain sentences.
- Today's date is ${todayIso}.
- If a search tool returns multiple candidates (e.g. more than one client matching a name), ask the user to clarify rather than guessing which one they meant.
- Keep answers short and direct — this is often read on a phone in a truck. Lead with the answer, then a brief supporting detail if useful.
- If a tool returns no results, say so plainly rather than inventing an answer.`;

// deno-lint-ignore no-explicit-any
type AnthropicContentBlock = any;

async function callAnthropic(
  apiKey: string,
  messages: { role: string; content: unknown }[],
  includeTools: boolean,
): Promise<{ content: AnthropicContentBlock[]; stop_reason: string }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: systemPrompt(new Date().toISOString().slice(0, 10)),
      messages,
      ...(includeTools ? { tools: TOOLS } : {}),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${text.slice(0, 500)}`);
  }
  return resp.json();
}

const extractText = (content: AnthropicContentBlock[]): string =>
  content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized", message: "Missing Authorization header." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKeyHeader =
    req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !apiKeyHeader) {
    return json({ ok: false, error: "server_misconfigured", message: "Supabase URL/key not available to the function." }, 500);
  }
  if (!anthropicKey) {
    return json({ ok: false, error: "server_misconfigured", message: "ANTHROPIC_API_KEY secret is not set." }, 500);
  }

  const sb = createClient(supabaseUrl, apiKeyHeader, { global: { headers: { Authorization: authHeader } } });

  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();
  if (userError || !user) {
    return json({ ok: false, error: "unauthorized", message: "Your session isn't valid — try signing in again." }, 401);
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_request", message: "Malformed request body." });
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES);

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return json({ ok: false, error: "invalid_request", message: "Send at least one user message." });
  }
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.content.length > MAX_MESSAGE_LENGTH) {
    return json({
      ok: false,
      error: "message_too_long",
      message: `Please keep questions under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  // Rate limit: count this user's questions in the last 24h before spending
  // anything on the Anthropic call.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await sb
    .from("assistant_usage_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) {
    return json({ ok: false, error: "server_error", message: countError.message }, 500);
  }
  if ((count ?? 0) >= DAILY_MESSAGE_LIMIT) {
    return json({
      ok: false,
      error: "rate_limited",
      message: `You've hit today's limit of ${DAILY_MESSAGE_LIMIT} questions — try again tomorrow.`,
    });
  }

  const { error: logError } = await sb.from("assistant_usage_log").insert({});
  if (logError) {
    return json({ ok: false, error: "server_error", message: logError.message }, 500);
  }

  // deno-lint-ignore no-explicit-any
  const anthropicMessages: { role: string; content: any }[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    let finalText: string | null = null;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await callAnthropic(anthropicKey, anthropicMessages, true);
      if (resp.stop_reason !== "tool_use") {
        finalText = extractText(resp.content);
        break;
      }

      anthropicMessages.push({ role: "assistant", content: resp.content });
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        let result: unknown;
        try {
          result = await callTool(block.name, block.input ?? {}, sb);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
      anthropicMessages.push({ role: "user", content: toolResults });
    }

    if (finalText == null) {
      // Exceeded the tool-call budget — one last call with tools disabled
      // to force a best-effort text answer from whatever was found so far.
      const resp = await callAnthropic(anthropicKey, anthropicMessages, false);
      finalText = extractText(resp.content);
    }

    if (!finalText) {
      finalText = "I wasn't able to put together an answer to that — try rephrasing the question.";
    }

    return json({ ok: true, reply: finalText });
  } catch (err) {
    return json({ ok: false, error: "server_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
