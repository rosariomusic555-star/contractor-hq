// ContractorHQ AI assistant — chat over the signed-in user's own business
// data, plus one confirmable write action (create_expense). See
// tools.ts for tool definitions/dispatch and format.ts for shared math.
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
//
// Write-action model (v2): the model NEVER writes to the database. A tool
// like create_expense only validates/resolves inputs and returns a
// proposal (mode: "chat"); the actual INSERT happens only in the separate
// mode: "execute_action" request, which never calls Anthropic at all — it
// runs only in direct response to the user tapping Confirm in the UI. The
// two request modes are handled by entirely separate code paths below, so
// there is no way for a chat turn, however phrased or "confirmed" by the
// model's own text, to trigger a write on its own.

import { createClient } from "@supabase/supabase-js";
import { callTool, TOOLS, type ResolvedCreateExpenseAction } from "./tools.ts";
import { formatCurrency } from "./format.ts";

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

// One line per request (chat OR execute_action — see assistant_usage_log,
// migration 0029), used to enforce this shared per-user daily cap. A full
// "propose then confirm" interaction spends 2 of these.
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

const systemPrompt = (todayIso: string) => `You are an assistant built into ContractorHQ, a business-management app for a solo/small contracting business. You can READ the current user's own data through the tools provided, and you can propose ONE kind of write action — logging a new expense via create_expense — but you can never actually create, edit, or delete anything yourself. create_expense only resolves and validates a proposal; the record is created only if the user taps Confirm on the card the app shows them. Never claim to have added, changed, or deleted anything — you can only propose it.

Rules:
- Always use a tool to look up real numbers or records rather than guessing or estimating. Never fabricate project names, amounts, or dates.
- All amounts returned by tools are plain numbers in US dollars — format them as currency in your answer (e.g. $1,234.56).
- Plain text only — the chat UI does not render markdown, so never use **bold**, #headings, or [links](url). A leading "- " for a short list is fine; anything else should just be plain sentences.
- Today's date is ${todayIso}.
- If a search tool returns multiple candidates (e.g. more than one client or project matching a name), ask the user to clarify rather than guessing which one they meant.
- Only call create_expense for a clear, unambiguous, imperative request to add/log/record an expense (e.g. "add $400 of base material to Smith's patio"). If a message could instead be read as a question about existing spending (e.g. "how much did I spend on Smith's patio"), treat it as a question and answer it with the read tools — never propose a write for ambiguous or interrogative phrasing. If you're not sure which the user meant, ask a brief clarifying question in plain text instead of calling create_expense.
- Never call create_expense with a guessed project_id — resolve it via list_projects first. If more than one project plausibly matches what the user said, list the matches and ask them to pick one rather than choosing yourself.
- Never call create_expense with a guessed amount — if the user didn't state a clear dollar amount, ask for it first.
- Only pass a category to create_expense if the user actually named one — don't invent or guess a category. If they didn't mention one, omit it entirely (it defaults to Uncategorized, same as the manual Add Expense form).
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

// Quick Quote description generation — a single-shot, no-tools,
// no-history call sharing this function's Anthropic client/key and
// per-user rate limit rather than a separate integration. Kept entirely
// separate from the chat system prompt/tool loop above: this never reads
// or writes the user's business data, it only turns a build type + a
// handful of answers into client-facing sentence(s).
const MAX_DESCRIPTION_TOKENS = 200;

const descriptionSystemPrompt = `You write a single short, professional description for one line item on a client-facing contractor quote. 1-3 sentences, plain prose, no markdown, no headings, no bullet points. Describe the scope of work using the build type and details given — mention the product/brand if one is given, and the size/quantity. Don't invent details not given to you. Don't mention price, rate, or cost. Return only the description text, nothing else.`;

async function generateQuoteDescription(apiKey: string, buildType: string, answers: Record<string, string>): Promise<Response> {
  const details = Object.entries(answers ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const userMessage = `Build type: ${buildType}\n${details}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_DESCRIPTION_TOKENS,
      system: descriptionSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return json({ ok: false, error: "server_error", message: `Anthropic API error (${resp.status}): ${text.slice(0, 300)}` }, 500);
  }
  const data = await resp.json();
  const description = extractText(data.content ?? []);
  if (!description) {
    return json({ ok: false, error: "server_error", message: "The assistant didn't return a description." });
  }
  return json({ ok: true, description });
}

/**
 * The ONLY code path in this function that writes to the database.
 * Re-validates everything from scratch against live data — nothing echoed
 * back from the client (the proposal shown on the confirmation card) is
 * trusted at face value except which record to attempt. Logs the attempt
 * (success or failure) to assistant_action_log either way.
 */
// deno-lint-ignore no-explicit-any
async function executeCreateExpense(action: any, sb: any, userId: string): Promise<Response> {
  const logFailure = async (reason: string, message: string, partial: Record<string, unknown> = {}) => {
    await sb.from("assistant_action_log").insert({
      action_type: "create_expense",
      status: "failed",
      error_message: message,
      ...partial,
    });
    return json({ ok: false, error: reason, message });
  };

  const projectId = typeof action?.project_id === "string" ? action.project_id : "";
  if (!projectId) return logFailure("invalid_input", "Missing project.");

  const { data: project, error: pErr } = await sb.from("projects").select("id").eq("id", projectId).single();
  if (pErr || !project) {
    return logFailure("project_not_found", "That project wasn't found — it may have been deleted.", {
      project_id: projectId,
    });
  }

  const name = typeof action?.name === "string" ? action.name.trim() : "";
  if (!name) return logFailure("invalid_input", "Missing expense name.", { project_id: projectId });

  const amount = Number(action?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return logFailure("invalid_amount", "The amount must be greater than 0.", { project_id: projectId });
  }

  let expenseCategoryId: string | null = null;
  if (action?.expense_category_id != null) {
    const { data: category, error: cErr } = await sb
      .from("expense_categories")
      .select("id")
      .eq("id", action.expense_category_id)
      .single();
    if (cErr || !category) {
      return logFailure(
        "category_not_found",
        "That expense category no longer exists — it may have been deleted or renamed.",
        { project_id: projectId, amount },
      );
    }
    expenseCategoryId = category.id;
  }

  const date = typeof action?.date === "string" && !Number.isNaN(Date.parse(action.date)) ? action.date : null;

  const { data: expense, error: insertError } = await sb
    .from("expenses")
    .insert({
      project_id: projectId,
      user_id: userId, // expenses.user_id has no default auth.uid() — must be set explicitly (see src/lib/api.ts createExpense()).
      name,
      amount,
      date,
      expense_category_id: expenseCategoryId,
    })
    .select()
    .single();

  if (insertError || !expense) {
    return logFailure("write_failed", insertError?.message ?? "The expense couldn't be saved.", {
      project_id: projectId,
      amount,
      expense_category_id: expenseCategoryId,
    });
  }

  // Fire-and-forget, same convention as src/lib/api.ts logProjectEvent — a
  // logging failure here should never fail the real write, which already
  // succeeded above.
  try {
    await sb
      .from("project_events")
      .insert({ project_id: projectId, kind: "expense_logged", summary: `Expense: ${name} · ${formatCurrency(amount)}` });
  } catch {
    // non-fatal
  }

  await sb.from("assistant_action_log").insert({
    action_type: "create_expense",
    status: "executed",
    project_id: projectId,
    amount,
    expense_category_id: expenseCategoryId,
    created_expense_id: expense.id,
  });

  return json({ ok: true, executed: true, expense_id: expense.id });
}

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

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_request", message: "Malformed request body." });
  }

  const mode =
    body?.mode === "execute_action"
      ? "execute_action"
      : body?.mode === "generate_quote_description"
        ? "generate_quote_description"
        : "chat";

  // Rate limit — shared across both modes (see DAILY_MESSAGE_LIMIT above).
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

  if (mode === "execute_action") {
    if (body?.action?.type !== "create_expense") {
      return json({ ok: false, error: "invalid_request", message: "Unsupported or missing action." });
    }
    return executeCreateExpense(body.action, sb, user.id);
  }

  if (mode === "generate_quote_description") {
    const buildType = typeof body?.buildType === "string" ? body.buildType : "";
    const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};
    if (!buildType) {
      return json({ ok: false, error: "invalid_request", message: "Missing build type." });
    }
    return generateQuoteDescription(anthropicKey, buildType, answers);
  }

  const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
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

  // deno-lint-ignore no-explicit-any
  const anthropicMessages: { role: string; content: any }[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    let finalText: string | null = null;
    let pendingAction: ResolvedCreateExpenseAction | null = null;

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
        if (
          block.name === "create_expense" &&
          result &&
          typeof result === "object" &&
          (result as { status?: string }).status === "ready"
        ) {
          pendingAction = (result as { action: ResolvedCreateExpenseAction }).action;
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

    return json({ ok: true, reply: finalText, ...(pendingAction ? { pendingAction } : {}) });
  } catch (err) {
    return json({ ok: false, error: "server_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
