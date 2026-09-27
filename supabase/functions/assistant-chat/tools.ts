// Read-only tool definitions + dispatch for the assistant. Every function
// here takes `sb`, a Supabase client built from the CALLING USER's own JWT
// (see index.ts) — every query below runs through Postgres RLS exactly as
// it does everywhere else in the app. There is no user_id parameter on any
// tool for the model to supply: the user is fixed by the JWT the Edge
// Function verified before any of this runs, so there is no way for a
// question, however phrased, to reach another user's row.
//
// v1 was read-only by design. v2 adds exactly one write-shaped tool,
// create_expense — but note it does NOT write anything itself. It only
// validates/resolves inputs against the DB and returns a proposal; the
// actual INSERT happens in a separate code path (index.ts's
// "execute_action" request mode) that only ever runs in response to the
// user tapping Confirm in the UI, never as a side effect of anything the
// model does. See index.ts's top comment for the full propose/execute split.

import {
  approvedChangeOrderTotal,
  invoiceDaysLate,
  costPlanTotals,
  approvedAddonQuoteTotal,
  actualCostByType,
  nonZeroBuckets,
  type CostSectionLike,
  type ExpenseLike,
  momChange,
  monthlyRevenue,
  pickHeadlineQuote,
  quoteItemIncluded,
  quoteLineTotal,
  quoteTotal,
  collectedByCategory,
  type ChangeOrderLike,
  type QuoteLike,
} from "./format.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const TOOLS = [
  {
    name: "list_projects",
    description:
      "List the contractor's projects/jobs, optionally filtered by status or a text search on the project name. Use this to resolve a job mentioned by name (e.g. 'the Miller job') to a project_id before calling get_project_financials. Only real jobs are returned by default: pre-sale projects (auto-created behind a pipeline opportunity that isn't Won yet — they just hold its estimate) are left out, so never count them as jobs. Set include_pre_sale only for pipeline/estimate questions; those rows come back with pre_sale: true.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["estimating", "scheduled", "in_progress", "complete", "lost"] },
        search: { type: "string", description: "Case-insensitive substring match on the project name." },
        include_pre_sale: {
          type: "boolean",
          description: "Also return pre-sale projects (opportunity not Won yet). Default false — only for pipeline questions.",
        },
      },
    },
  },
  {
    name: "get_project_financials",
    description:
      "Get the contract total (headline quote + approved change orders), predicted cost (the project's Cost plan: material, subcontractor, equipment and other lines plus each section's labor), actual cost-to-date (logged expenses matched to a cost type through their expense category, plus labor logged on the Labor log), both broken down by type, and predicted/actual profit and margin for one project. This is the tool for any 'margin', 'profit', or 'how much have I spent on X job' question.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "search_quotes",
    description:
      "Search/list quotes with their totals, filterable by status, client name, a text search on project/client name, and a created_at date range.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "sent", "approved"] },
        client: { type: "string", description: "Case-insensitive substring match on the client's name." },
        search: { type: "string", description: "Case-insensitive substring match on project or client name." },
        date_from: { type: "string", description: "ISO date, inclusive lower bound on created_at." },
        date_to: { type: "string", description: "ISO date, inclusive upper bound on created_at." },
      },
    },
  },
  {
    name: "get_quote_detail",
    description: "Get full line-item detail for one quote by id (sections, items, totals, deposit, status).",
    input_schema: {
      type: "object",
      properties: { quote_id: { type: "string" } },
      required: ["quote_id"],
    },
  },
  {
    name: "search_invoices",
    description:
      "Search/list invoices, filterable by status, client name, overdue-only, and a created_at date range. Includes days_late for each invoice.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue"] },
        client: { type: "string" },
        search: { type: "string", description: "Case-insensitive substring match on project or client name." },
        overdue_only: { type: "boolean" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "list_expenses",
    description:
      "List logged expenses, optionally filtered to one project (by project_id), a cost category name, or a date range. Returns the matching rows plus their total sum (the sum always covers every match, even if the row list itself is truncated).",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        category: { type: "string", description: "Case-insensitive substring match on the expense category name." },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "get_client_detail",
    description:
      "Look up a client by name (fuzzy search) or by client_id. If a name search matches more than one client, returns the candidate list instead of picking one — call again with the specific client_id. Returns contact info plus their projects (real jobs only — pre-sale projects behind a not-yet-Won opportunity are left out), quote/invoice counts, and lifetime value (sum of their paid invoices).",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Case-insensitive substring match on the client's name." },
        client_id: { type: "string" },
      },
    },
  },
  {
    name: "revenue_summary",
    description:
      "Monthly invoiced-revenue totals (and month-over-month change) over an optional date range, plus total_collected — every payment received in the range (applied to invoices or held as project credit) — with an optional breakdown of collected revenue by work category.",
    input_schema: {
      type: "object",
      properties: {
        date_from: { type: "string" },
        date_to: { type: "string" },
        by_category: { type: "boolean" },
      },
    },
  },
  {
    name: "get_job_closeouts",
    description:
      "Completed-job closeouts: how each finished job went against its plan — planned vs actual cost by feature, labor hours, profit, the job context (slope, access, soil, demo, crew size), per-unit actuals (e.g. base tons per sq ft, man-hours per sq ft, labor actual÷planned) and the contractor's 'what happened' note. Use it to answer questions like 'how did my sloped patios go' or 'which jobs ran over on labor'. Report the numbers as they are; don't invent estimates. Excluded (unusual) jobs are marked.",
    input_schema: {
      type: "object",
      properties: {
        build_type: { type: "string", description: "Optional, e.g. paver_patio, seating_wall, retaining_wall" },
        include_excluded: { type: "boolean" },
      },
    },
  },
  {
    name: "get_needs_attention",
    description:
      "The exact same 'needs your attention' list shown on the dashboard: invoices overdue 3+ days, quotes shared 3+ days ago with no response yet, approved quotes that haven't been billed a deposit, overdue tasks/follow-ups, and pipeline leads that have gone quiet (an early-stage opportunity with no next action date and no activity in 3+ days). This is the tool for 'which quotes haven't I followed up on', 'what's overdue', 'what leads have gone cold', and similar questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_opportunities",
    description:
      "List the contractor's sales pipeline opportunities, optionally filtered by stage or a text search on the opportunity title or client name. Use this to resolve an opportunity mentioned by name/client before calling create_task with an opportunity_id, or to answer 'what's in my pipeline' / 'what opportunities do I have with X' questions.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: [
            "new_lead", "contacted", "site_visit_scheduled", "site_visit_done",
            "proposal_sent", "revisions", "won", "lost",
          ],
        },
        search: { type: "string", description: "Case-insensitive substring match on the opportunity title or client name." },
      },
    },
  },
  {
    name: "get_pipeline_summary",
    description:
      "A rollup of the sales pipeline: opportunity counts per stage, and per lead_source (leads, won, lost, win rate, open/won value from each lead's linked quote — 0 for a lead with no quote yet). This is the tool for 'how's my pipeline doing', 'where are my leads coming from', 'what's my win rate' and similar questions — don't try to compute this yourself from list_opportunities.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_task",
    description:
      "Resolve a request to create a follow-up task/reminder into a concrete, confirmable proposal. This does NOT create the task — it only validates any client/opportunity reference and returns a proposal for the user to confirm in the UI; the record is created only after they tap Confirm. Only call this for a clear, imperative request to add/create/remind/follow up (e.g. 'remind me to call Jay Tuesday', 'follow up with the Smith opportunity next week') — for questions about existing tasks, there's no read tool for that yet, so answer from get_needs_attention's overdue_tasks or say you don't have that. If the user named a client, resolve client_id via get_client_detail first — never guess one. If they named an opportunity, resolve opportunity_id via list_opportunities first — never guess one. If the due date is relative ('Tuesday', 'next week'), convert it to an ISO date yourself using today's date from the system prompt; if no date was mentioned at all, omit due_date entirely rather than guessing one.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title, e.g. 'Call about patio estimate'." },
        client_id: { type: "string", description: "Exact client id, resolved via get_client_detail. Omit if no client was named." },
        opportunity_id: { type: "string", description: "Exact opportunity id, resolved via list_opportunities. Omit if no opportunity was named." },
        due_date: { type: "string", description: "ISO date (YYYY-MM-DD). Omit entirely if the user gave no date." },
        task_type: {
          type: "string",
          enum: [
            "text", "email", "site_visit", "prepare_estimate", "send_proposal",
            "follow_up", "collect_deposit", "schedule_project", "general_task",
          ],
          description: "Only set this if it's clearly implied (e.g. 'email' -> email); default is general_task. There is no call task type — use follow_up for 'call X' requests.",
        },
        priority: { type: "string", enum: ["low", "normal", "high"], description: "Only set if the user signals urgency; default is normal." },
      },
      required: ["title"],
    },
  },
  {
    name: "create_expense",
    description:
      "Resolve a request to log a new expense into a concrete, confirmable proposal. This does NOT create the expense — it only validates project/category references and returns a proposal for the user to confirm in the UI; the record is created only after they tap Confirm. Only call this for a clear, imperative request to add/log/record an expense — for any question about existing spending, use list_expenses or get_project_financials instead. Always resolve project_id via list_projects first if the user named the project — never guess an id, and if list_projects returns more than one plausible match, ask the user to pick one in plain text rather than calling this tool. If the amount isn't clearly stated, ask for it instead of guessing.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Exact project id, resolved via list_projects." },
        name: { type: "string", description: "Short label for the expense, e.g. 'Base material'." },
        amount: { type: "number", description: "Dollar amount, must be greater than 0." },
        category: {
          type: "string",
          description:
            "Expense category name as the user said it, if they mentioned one. Omit entirely if they didn't — it will default to Uncategorized, same as the manual Add Expense form. Only provide this if the user actually named a category; it will be validated against their real category list and rejected (not guessed) if it doesn't match.",
        },
        date: { type: "string", description: "ISO date (YYYY-MM-DD). Omit to default to today." },
      },
      required: ["project_id", "name", "amount"],
    },
  },
] as const;

export interface ResolvedCreateExpenseAction {
  type: "create_expense";
  project_id: string;
  project_name: string;
  name: string;
  amount: number;
  expense_category_id: string | null;
  category_name: string | null;
  date: string;
  date_was_defaulted: boolean;
}

export interface ResolvedCreateTaskAction {
  type: "create_task";
  title: string;
  client_id: string | null;
  client_name: string | null;
  opportunity_id: string | null;
  opportunity_title: string | null;
  due_date: string | null;
  task_type: string;
  priority: string;
}

// Same rule as src/lib/api.ts isPreSaleProject(): a project whose linked
// opportunity isn't Won is pre-sale — not a real job. Derived, never stored.
// deno-lint-ignore no-explicit-any
const isPreSale = (p: any) => (p.opportunities ?? []).some((o: { stage: string }) => o.stage !== "won");

async function listProjects(input: { status?: string; search?: string; include_pre_sale?: boolean }, sb: SupabaseClient) {
  let q = sb
    .from("projects")
    .select("id,name,status,created_at,updated_at,client:clients(name),opportunities!opportunities_project_id_fkey(stage)")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (input.status) q = q.eq("status", input.status);
  if (input.search) q = q.ilike("name", `%${input.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => input.include_pre_sale || !isPreSale(p))
    // deno-lint-ignore no-explicit-any
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      client_name: p.client?.name ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ...(isPreSale(p) ? { pre_sale: true } : {}),
    }));
}

async function getProjectFinancials(input: { project_id: string }, sb: SupabaseClient) {
  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id,name,status,client:clients(name),opportunities!opportunities_project_id_fkey(stage)")
    .eq("id", input.project_id)
    .single();
  if (pErr) throw pErr;

  const { data: quotes, error: qErr } = await sb
    .from("quotes")
    .select("id,status,kind,created_at,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected))")
    .eq("project_id", input.project_id);
  if (qErr) throw qErr;

  const { data: changeOrders, error: coErr } = await sb
    .from("change_orders")
    .select("status,amount")
    .eq("project_id", input.project_id);
  if (coErr) throw coErr;

  const headline = pickHeadlineQuote((quotes ?? []) as QuoteLike[]);
  const quoteBase = headline ? quoteTotal(headline.quote_sections) : null;
  // Contract value = headline quote + APPROVED change orders only — same
  // definition as everywhere else in the app (projectContractValue() in
  // src/lib/api.ts). Null only when there's no quote at all yet.
  const quoted =
    quoteBase != null
      ? quoteBase + approvedAddonQuoteTotal((quotes ?? []) as QuoteLike[]) + approvedChangeOrderTotal((changeOrders ?? []) as ChangeOrderLike[])
      : null;

  const { data: costSections, error: mErr } = await sb
    .from("materials_sections")
    .select(
      "labor_mode,labor_crew_size,labor_days,labor_hours_per_day,labor_rate,labor_lump_sum,materials_items(quantity,unit_cost,waste_percent,cost_type)",
    )
    .eq("project_id", input.project_id);
  if (mErr) throw mErr;
  const sections = (costSections ?? []) as CostSectionLike[];
  const planned = costPlanTotals(sections);
  const hasPlan = sections.some((sec) => (sec.materials_items?.length ?? 0) > 0 || !!sec.labor_mode);
  const predictedCost = hasPlan ? planned.total : null;

  const { data: expenses, error: eErr } = await sb
    .from("expenses")
    .select("name,amount,date,created_at,expense_category_id,expense_lines(amount,expense_category_id)")
    .eq("project_id", input.project_id)
    .order("created_at", { ascending: false });
  if (eErr) throw eErr;
  const { data: expenseCategories, error: ecErr } = await sb.from("expense_categories").select("id,cost_type");
  if (ecErr) throw ecErr;
  const { data: laborEntries, error: lErr } = await sb.from("labor_entries").select("cost").eq("project_id", input.project_id);
  if (lErr) throw lErr;
  // deno-lint-ignore no-explicit-any
  const laborActual = (laborEntries ?? []).reduce((s: number, e: any) => s + Number(e.cost), 0);
  const actual = actualCostByType((expenses ?? []) as ExpenseLike[], expenseCategories ?? [], laborActual);
  const actualCost = (expenses ?? []).length > 0 || (laborEntries ?? []).length > 0 ? actual.total : null;

  const marginPct = (cost: number | null) =>
    quoted != null && quoted > 0 && cost != null ? Math.round(((quoted - cost) / quoted) * 100) : null;

  return {
    project_name: project.name,
    status: project.status,
    // Asked about directly — still answer, but flag it isn't a real job yet.
    ...(isPreSale(project) ? { pre_sale: true } : {}),
    client_name: project.client?.name ?? null,
    // Headline quote total + approved change orders — same "contract
    // value" every other screen in the app shows for this project.
    contract_total: quoted,
    predicted_cost: predictedCost,
    predicted_cost_by_type: hasPlan ? nonZeroBuckets(planned) : null,
    actual_cost_to_date: actualCost,
    actual_cost_by_type: actualCost != null ? nonZeroBuckets(actual) : null,
    predicted_profit: quoted != null && predictedCost != null ? quoted - predictedCost : null,
    predicted_margin_pct: marginPct(predictedCost),
    actual_profit: quoted != null && actualCost != null ? quoted - actualCost : null,
    actual_margin_pct: marginPct(actualCost),
    recent_expenses: (expenses ?? [])
      .slice(0, 5)
      // deno-lint-ignore no-explicit-any
      .map((e: any) => ({ name: e.name, amount: Number(e.amount), date: e.date })),
  };
}

async function searchQuotes(
  input: { status?: string; client?: string; search?: string; date_from?: string; date_to?: string },
  sb: SupabaseClient,
) {
  let q = sb
    .from("quotes")
    .select(
      "id,status,created_at,updated_at,deposit_percentage,project:projects(name,client:clients(name)),client:clients(name),quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected))",
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (input.status) q = q.eq("status", input.status);
  if (input.date_from) q = q.gte("created_at", input.date_from);
  if (input.date_to) q = q.lte("created_at", input.date_to);
  const { data, error } = await q;
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  let rows = (data ?? []).map((quote: any) => ({
    id: quote.id,
    status: quote.status,
    project_name: quote.project?.name ?? null,
    client_name: quote.client?.name ?? quote.project?.client?.name ?? null,
    total: quoteTotal(quote.quote_sections),
    deposit_percentage: quote.deposit_percentage,
    created_at: quote.created_at,
    updated_at: quote.updated_at,
  }));

  // client/search are substring filters applied here rather than as
  // PostgREST filters on embedded resources, which is fragile across
  // versions — a user's total row count comfortably fits in one query.
  if (input.client) {
    const needle = input.client.toLowerCase();
    rows = rows.filter((r) => r.client_name?.toLowerCase().includes(needle));
  }
  if (input.search) {
    const needle = input.search.toLowerCase();
    rows = rows.filter(
      (r) => r.project_name?.toLowerCase().includes(needle) || r.client_name?.toLowerCase().includes(needle),
    );
  }

  return { quotes: rows.slice(0, 30), total_matches: rows.length, truncated: rows.length > 30 };
}

async function getQuoteDetail(input: { quote_id: string }, sb: SupabaseClient) {
  const { data: quote, error } = await sb
    .from("quotes")
    .select(
      "id,status,deposit_percentage,created_at,updated_at,project:projects(name),client:clients(name),quote_sections(name,sort_order,is_optional,quote_items(name,description,price,quantity,unit,is_optional,client_selected,sort_order,category_id))",
    )
    .eq("id", input.quote_id)
    .single();
  if (error) throw error;

  const categoryIds = [
    ...new Set(
      // deno-lint-ignore no-explicit-any
      quote.quote_sections.flatMap((s: any) => s.quote_items.map((i: any) => i.category_id).filter(Boolean)),
    ),
  ];
  const categoryNames = new Map<string, string>();
  if (categoryIds.length) {
    const { data: cats } = await sb.from("categories").select("id,name").in("id", categoryIds);
    // deno-lint-ignore no-explicit-any
    for (const c of cats ?? []) categoryNames.set((c as any).id, (c as any).name);
  }

  const sections = [...quote.quote_sections]
    // deno-lint-ignore no-explicit-any
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    // deno-lint-ignore no-explicit-any
    .map((s: any) => ({
      name: s.name,
      items: [...s.quote_items]
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        // deno-lint-ignore no-explicit-any
        .map((i: any) => ({
          name: i.name,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.price,
          line_total: quoteLineTotal(i),
          included: quoteItemIncluded(s, i),
          category: i.category_id ? categoryNames.get(i.category_id) ?? null : null,
        })),
    }));

  return {
    id: quote.id,
    status: quote.status,
    project_name: quote.project?.name ?? null,
    client_name: quote.client?.name ?? null,
    deposit_percentage: quote.deposit_percentage,
    total: quoteTotal(quote.quote_sections),
    created_at: quote.created_at,
    updated_at: quote.updated_at,
    sections,
  };
}

async function searchInvoices(
  input: {
    status?: string;
    client?: string;
    search?: string;
    overdue_only?: boolean;
    date_from?: string;
    date_to?: string;
  },
  sb: SupabaseClient,
) {
  let q = sb
    .from("invoices")
    .select("id,status,amount,due_date,invoice_number,created_at,project:projects(name,client:clients(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (input.status) q = q.eq("status", input.status);
  if (input.date_from) q = q.gte("created_at", input.date_from);
  if (input.date_to) q = q.lte("created_at", input.date_to);
  const { data, error } = await q;
  if (error) throw error;

  const now = new Date();
  // deno-lint-ignore no-explicit-any
  let rows = (data ?? []).map((inv: any) => ({
    id: inv.id,
    status: inv.status,
    invoice_number: inv.invoice_number,
    amount: Number(inv.amount),
    due_date: inv.due_date,
    project_name: inv.project?.name ?? null,
    client_name: inv.project?.client?.name ?? null,
    days_late: invoiceDaysLate(inv, now),
    created_at: inv.created_at,
  }));

  if (input.overdue_only) rows = rows.filter((r) => r.days_late > 0);
  if (input.client) {
    const needle = input.client.toLowerCase();
    rows = rows.filter((r) => r.client_name?.toLowerCase().includes(needle));
  }
  if (input.search) {
    const needle = input.search.toLowerCase();
    rows = rows.filter(
      (r) => r.project_name?.toLowerCase().includes(needle) || r.client_name?.toLowerCase().includes(needle),
    );
  }

  return { invoices: rows.slice(0, 30), total_matches: rows.length, truncated: rows.length > 30 };
}

async function listExpensesTool(
  input: { project_id?: string; category?: string; date_from?: string; date_to?: string },
  sb: SupabaseClient,
) {
  let q = sb
    .from("expenses")
    .select(
      "id,name,amount,date,created_at,project:projects(name),expense_category:expense_categories(name),expense_lines(amount,description,expense_category:expense_categories(name))",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (input.project_id) q = q.eq("project_id", input.project_id);
  if (input.date_from) q = q.gte("created_at", input.date_from);
  if (input.date_to) q = q.lte("created_at", input.date_to);
  const { data, error } = await q;
  if (error) throw error;

  // A split expense (0096: two or more expense_lines) becomes one row per
  // line, with the line's own category + amount — same rule as the app's
  // expenseCategoryAllocations(), so category filters and totals match it.
  // Any unallocated remainder is its own Uncategorized row.
  // deno-lint-ignore no-explicit-any
  let rows = (data ?? []).flatMap((e: any) => {
    const base = { id: e.id, date: e.date, project_name: e.project?.name ?? null, created_at: e.created_at };
    const lines = e.expense_lines ?? [];
    if (lines.length < 2) {
      return [{ ...base, name: e.name, amount: Number(e.amount), category: e.expense_category?.name ?? "Uncategorized" }];
    }
    // deno-lint-ignore no-explicit-any
    const split = lines.map((l: any) => ({
      ...base,
      name: l.description ? `${e.name} — ${l.description}` : e.name,
      amount: Number(l.amount),
      category: l.expense_category?.name ?? "Uncategorized",
    }));
    // deno-lint-ignore no-explicit-any
    const remainder = Math.round((Number(e.amount) - split.reduce((s: number, r: any) => s + r.amount, 0)) * 100) / 100;
    return remainder !== 0 ? [...split, { ...base, name: `${e.name} — unallocated`, amount: remainder, category: "Uncategorized" }] : split;
  });
  if (input.category) {
    const needle = input.category.toLowerCase();
    rows = rows.filter((r) => r.category.toLowerCase().includes(needle));
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { expenses: rows.slice(0, 50), total, count: rows.length, truncated: rows.length > 50 };
}

async function getClientDetail(input: { search?: string; client_id?: string }, sb: SupabaseClient) {
  // deno-lint-ignore no-explicit-any
  let clients: any[];
  if (input.client_id) {
    const { data, error } = await sb.from("clients").select("*").eq("id", input.client_id).single();
    if (error) throw error;
    clients = [data];
  } else if (input.search) {
    const { data, error } = await sb.from("clients").select("*").ilike("name", `%${input.search}%`).limit(5);
    if (error) throw error;
    clients = data ?? [];
  } else {
    return { error: "Provide either search or client_id." };
  }

  if (clients.length === 0) return { matches: [] };
  if (clients.length > 1) {
    return {
      // deno-lint-ignore no-explicit-any
      matches: clients.map((c: any) => ({ id: c.id, name: c.name })),
      note: "Multiple clients matched — call again with a specific client_id.",
    };
  }

  const client = clients[0];
  const { data: allProjects, error: projErr } = await sb
    .from("projects")
    .select("id,name,status,opportunities!opportunities_project_id_fkey(stage)")
    .eq("client_id", client.id);
  if (projErr) throw projErr;
  // Quote/invoice history still spans every project (pre-sale estimates
  // included); the project list/count is real jobs only.
  // deno-lint-ignore no-explicit-any
  const projectIds = (allProjects ?? []).map((p: any) => p.id);
  // deno-lint-ignore no-explicit-any
  const projects = (allProjects ?? []).filter((p: any) => !isPreSale(p));

  const quoteSelect = "id,status,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected))";
  const quoteQueries = [sb.from("quotes").select(quoteSelect).eq("client_id", client.id)];
  if (projectIds.length) quoteQueries.push(sb.from("quotes").select(quoteSelect).in("project_id", projectIds));
  const quoteResults = await Promise.all(quoteQueries);
  for (const r of quoteResults) if (r.error) throw r.error;
  // deno-lint-ignore no-explicit-any
  const quoteMap = new Map<string, any>();
  for (const r of quoteResults) for (const q of r.data ?? []) quoteMap.set(q.id, q);
  const quotes = [...quoteMap.values()];
  const quoteIds = quotes.map((q) => q.id);

  const invoiceSelect = "id,amount,status,created_at";
  const invoiceQueries = [];
  if (projectIds.length) invoiceQueries.push(sb.from("invoices").select(invoiceSelect).in("project_id", projectIds));
  if (quoteIds.length) invoiceQueries.push(sb.from("invoices").select(invoiceSelect).in("quote_id", quoteIds));
  const invoiceResults = await Promise.all(invoiceQueries);
  for (const r of invoiceResults) if (r.error) throw r.error;
  // deno-lint-ignore no-explicit-any
  const invoiceMap = new Map<string, any>();
  for (const r of invoiceResults) for (const inv of r.data ?? []) invoiceMap.set(inv.id, inv);
  const invoices = [...invoiceMap.values()];

  // Collected (0111) — every active payment received on their projects.
  let lifetimeValuePaid = 0;
  if (projectIds.length) {
    const { data: pays, error: pErr } = await sb.from("payments").select("amount,status").in("project_id", projectIds);
    if (pErr) throw pErr;
    lifetimeValuePaid = (pays ?? []).filter((p) => p.status !== "void").reduce((s, p) => s + Number(p.amount), 0);
  }

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    project_count: projects?.length ?? 0,
    quote_count: quotes.length,
    invoice_count: invoices.length,
    lifetime_value_paid: lifetimeValuePaid,
    // deno-lint-ignore no-explicit-any
    projects: (projects ?? []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })),
  };
}

async function revenueSummaryTool(
  input: { date_from?: string; date_to?: string; by_category?: boolean },
  sb: SupabaseClient,
) {
  // Invoiced basis (matches the Revenue page's own "Invoiced" card) — every
  // non-draft invoice, not just paid ones. Note the Dashboard's own
  // headline "This month" figure is collected (cash-basis), a different
  // number from total_invoiced below — see src/lib/financials.ts.
  let q = sb.from("invoices").select("amount,created_at,status,quote_id").neq("status", "draft");
  if (input.date_from) q = q.gte("created_at", input.date_from);
  if (input.date_to) q = q.lte("created_at", input.date_to);
  const { data: invoices, error } = await q;
  if (error) throw error;

  const points = monthlyRevenue(invoices ?? []);
  // deno-lint-ignore no-explicit-any
  const result: any = {
    monthly: points,
    month_over_month_change_pct: momChange(points),
    total_invoiced: (invoices ?? []).reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0),
  };

  // Collected (0111) — every active payment received in the range, by the
  // date it was received, applied to an invoice or not.
  let pq = sb.from("payments").select("amount,paid_on").eq("status", "active");
  if (input.date_from) pq = pq.gte("paid_on", input.date_from.slice(0, 10));
  if (input.date_to) pq = pq.lte("paid_on", input.date_to.slice(0, 10));
  const { data: received, error: pErr } = await pq;
  if (pErr) throw pErr;
  result.total_collected = (received ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  if (input.by_category) {
    const { data: quotes, error: qErr } = await sb
      .from("quotes")
      .select("id,status,created_at,project_id,kind,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected,category_id))");
    if (qErr) throw qErr;
    const { data: categories, error: cErr } = await sb.from("categories").select("id,name");
    if (cErr) throw cErr;
    // Category revenue is collected (every active payment, 0111), split by
    // the applied invoice's quote or the project's contract mix — same
    // basis as the Revenue page's "Revenue by category" (all-time).
    const { data: allInvoices, error: aErr } = await sb.from("invoices").select("id,amount,status,quote_id,project_id,due_date,created_at");
    if (aErr) throw aErr;
    const { data: allPayments, error: apErr } = await sb
      .from("payments")
      .select("amount,status,project_id,payment_allocations(invoice_id,amount)");
    if (apErr) throw apErr;
    result.by_category = collectedByCategory(quotes ?? [], allInvoices ?? [], categories ?? [], allPayments ?? []);
  }

  return result;
}

async function getJobCloseouts(input: { build_type?: string; include_excluded?: boolean }, sb: SupabaseClient) {
  const { data, error } = await sb
    .from("project_closeouts")
    .select("context, features, what_happened, excluded, completed_on, snapshot, project:projects(name)")
    .is("superseded_at", null)
    .order("completed_on", { ascending: false });
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? [])
    .filter((c: any) => input.include_excluded || !c.excluded)
    // deno-lint-ignore no-explicit-any
    .map((c: any) => ({
      project: c.project?.name ?? "Project",
      completed_on: c.completed_on,
      excluded: c.excluded,
      what_happened: c.what_happened,
      context: c.context,
      expected_profit: c.snapshot?.report?.profit?.expected ?? null,
      actual_profit: c.snapshot?.report?.profit?.actual ?? null,
      features: (c.features ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((f: any) => !input.build_type || f.build_type === input.build_type)
        // deno-lint-ignore no-explicit-any
        .map((f: any) => ({
          name: f.name,
          build_type: f.build_type,
          size: f.size,
          size_unit: f.size_unit,
          base_depth_in: f.base_depth_in,
          material_system: f.material_system,
          planned_cost: f.planned?.total,
          actual_cost: f.actual?.total,
          labor_hours: f.labor,
          per_unit: f.units,
        })),
    }))
    // deno-lint-ignore no-explicit-any
    .filter((c: any) => c.features.length > 0);
}

async function getNeedsAttention(_input: Record<string, never>, sb: SupabaseClient) {
  const { data: quotes, error: qErr } = await sb
    .from("quotes")
    .select(
      "id,status,updated_at,deposit_percentage,project_id,project:projects(name),quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected))",
    );
  if (qErr) throw qErr;
  const { data: invoices, error: iErr } = await sb
    .from("invoices")
    .select("id,status,amount,amount_paid,due_date,quote_id,project_id,project:projects(name)");
  if (iErr) throw iErr;

  const now = new Date();
  const DAY = 86_400_000;
  const daysSince = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  const FOLLOWUP_DAYS_THRESHOLD = 3;
  const OVERDUE_DAYS_THRESHOLD = 3;

  const overdueInvoices = (invoices ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((i: any) => i.status === "sent" || i.status === "overdue")
    // deno-lint-ignore no-explicit-any
    .map((i: any) => ({ invoice: i, late: invoiceDaysLate(i, now) }))
    .filter(({ late }) => late >= OVERDUE_DAYS_THRESHOLD)
    .sort((a, b) => b.late - a.late)
    .map(({ invoice, late }) => ({
      project_name: invoice.project?.name ?? "Standalone",
      // Balance still owed after applied payments (0111).
      amount: Math.max(0, Number(invoice.amount) - Number(invoice.amount_paid ?? 0)),
      days_late: late,
    }));

  const quoteFollowups = (quotes ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((q: any) => q.status === "sent")
    // deno-lint-ignore no-explicit-any
    .map((q: any) => ({ quote: q, since: daysSince(q.updated_at) }))
    .filter(({ since }) => since >= FOLLOWUP_DAYS_THRESHOLD)
    .sort((a, b) => b.since - a.since)
    .map(({ quote, since }) => ({
      project_name: quote.project?.name ?? "Standalone quote",
      total: quoteTotal(quote.quote_sections),
      days_since_shared: since,
    }));

  const billed = new Set<string>();
  for (const inv of invoices ?? []) {
    // deno-lint-ignore no-explicit-any
    const i = inv as any;
    if (i.quote_id) billed.add(`quote:${i.quote_id}`);
    if (i.project_id) billed.add(`project:${i.project_id}`);
  }
  const depositsDue = (quotes ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((q: any) => q.status === "approved")
    // deno-lint-ignore no-explicit-any
    .filter((q: any) => !billed.has(`quote:${q.id}`) && !(q.project_id && billed.has(`project:${q.project_id}`)))
    // deno-lint-ignore no-explicit-any
    .map((q: any) => ({
      project_name: q.project?.name ?? "Standalone quote",
      deposit_percentage: q.deposit_percentage,
      total: quoteTotal(q.quote_sections),
    }));

  // CRM Phase 7 — widened to include overdue follow-up tasks and pipeline
  // leads that have gone quiet, same "needs attention" spirit as the
  // quote/invoice checks above.
  const { data: tasks, error: tErr } = await sb
    .from("tasks")
    .select("title,due_at,task_type,client:clients(name)")
    .eq("completed", false)
    .not("due_at", "is", null);
  if (tErr) throw tErr;
  const todayIso = now.toISOString().slice(0, 10);
  const overdueTasks = (tasks ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((t: any) => t.due_at.slice(0, 10) < todayIso)
    // deno-lint-ignore no-explicit-any
    .map((t: any) => ({ title: t.title, task_type: t.task_type, client_name: t.client?.name ?? null, due_date: t.due_at.slice(0, 10) }));

  const STALE_LEAD_STAGES = ["new_lead", "contacted"];
  const { data: opportunities, error: oErr } = await sb
    .from("opportunities")
    .select("title,stage,next_action_date,updated_at,client:clients(name)")
    .in("stage", STALE_LEAD_STAGES);
  if (oErr) throw oErr;
  const staleLeads = (opportunities ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((o: any) => !o.next_action_date && daysSince(o.updated_at) >= FOLLOWUP_DAYS_THRESHOLD)
    // deno-lint-ignore no-explicit-any
    .map((o: any) => ({ title: o.title, stage: o.stage, client_name: o.client?.name ?? null, days_since_activity: daysSince(o.updated_at) }));

  return {
    overdue_invoices: overdueInvoices,
    quote_followups: quoteFollowups,
    deposits_due: depositsDue,
    overdue_tasks: overdueTasks,
    stale_leads: staleLeads,
  };
}

// A lead's dollar value is its linked quote's real total (quote_id), never
// a manually-typed estimate — the opportunities.estimated_value column is
// no longer read anywhere in the app. null when there's no quote yet.
const OPPORTUNITY_QUOTE_SELECT =
  "quote:quotes(id,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected)))";

// deno-lint-ignore no-explicit-any
function opportunityQuoteValue(o: any): number | null {
  return o.quote ? quoteTotal(o.quote.quote_sections) : null;
}

async function listOpportunitiesTool(input: { stage?: string; search?: string }, sb: SupabaseClient) {
  let q = sb
    .from("opportunities")
    .select(
      `id,title,stage,lead_source,next_action,next_action_date,updated_at,client:clients(name),${OPPORTUNITY_QUOTE_SELECT}`,
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (input.stage) q = q.eq("stage", input.stage);
  const { data, error } = await q;
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  let rows = (data ?? []).map((o: any) => ({
    id: o.id,
    title: o.title,
    client_name: o.client?.name ?? null,
    stage: o.stage,
    quote_value: opportunityQuoteValue(o),
    lead_source: o.lead_source,
    next_action: o.next_action,
    next_action_date: o.next_action_date,
    updated_at: o.updated_at,
  }));
  if (input.search) {
    const needle = input.search.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle) || r.client_name?.toLowerCase().includes(needle));
  }
  return { opportunities: rows.slice(0, 30), total_matches: rows.length, truncated: rows.length > 30 };
}

async function getPipelineSummaryTool(_input: Record<string, never>, sb: SupabaseClient) {
  const { data, error } = await sb
    .from("opportunities")
    .select(`stage,lead_source,${OPPORTUNITY_QUOTE_SELECT}`);
  if (error) throw error;

  const byStage: Record<string, number> = {};
  interface SourceRow { leads: number; won: number; lost: number; open_value: number; won_value: number }
  const bySource = new Map<string, SourceRow>();
  // deno-lint-ignore no-explicit-any
  for (const o of (data ?? []) as any[]) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
    const key = o.lead_source?.trim() || "Unknown";
    const row = bySource.get(key) ?? { leads: 0, won: 0, lost: 0, open_value: 0, won_value: 0 };
    const value = opportunityQuoteValue(o) ?? 0;
    row.leads += 1;
    if (o.stage === "won") {
      row.won += 1;
      row.won_value += value;
    } else if (o.stage === "lost") row.lost += 1;
    else row.open_value += value;
    bySource.set(key, row);
  }

  return {
    by_stage: byStage,
    by_source: Array.from(bySource.entries()).map(([source, r]) => ({ source, ...r })),
  };
}

const TASK_TYPES = [
  "text", "email", "site_visit", "prepare_estimate", "send_proposal",
  "follow_up", "collect_deposit", "schedule_project", "general_task",
];

/**
 * Resolve-only — never writes. Validates client_id/opportunity_id (if
 * given) against the real, RLS-scoped data and returns either a
 * ready-to-confirm proposal or a specific, honest reason it couldn't
 * resolve one. The actual insert happens later, in index.ts's
 * executeCreateTask(), only after the user confirms — never from here.
 * Same shape/rigor as createExpenseTool below.
 */
async function createTaskTool(
  input: { title?: string; client_id?: string; opportunity_id?: string; due_date?: string; task_type?: string; priority?: string },
  sb: SupabaseClient,
) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { status: "error", reason: "invalid_input", message: "A task title is required." };

  let clientId: string | null = null;
  let clientName: string | null = null;
  if (typeof input.client_id === "string" && input.client_id) {
    const { data: client, error: cErr } = await sb.from("clients").select("id,name").eq("id", input.client_id).single();
    if (cErr || !client) return { status: "error", reason: "client_not_found", message: "That client wasn't found." };
    clientId = client.id;
    clientName = client.name;
  }

  let opportunityId: string | null = null;
  let opportunityTitle: string | null = null;
  if (typeof input.opportunity_id === "string" && input.opportunity_id) {
    const { data: opp, error: oErr } = await sb
      .from("opportunities")
      .select("id,title,client_id")
      .eq("id", input.opportunity_id)
      .single();
    if (oErr || !opp) return { status: "error", reason: "opportunity_not_found", message: "That opportunity wasn't found." };
    opportunityId = opp.id;
    opportunityTitle = opp.title;
    // An opportunity always belongs to a client — carry that client along
    // if the caller didn't separately resolve one, same as the app's own
    // CreateTaskDialog does implicitly via defaultClientId.
    if (!clientId) {
      const { data: client } = await sb.from("clients").select("id,name").eq("id", opp.client_id).single();
      if (client) {
        clientId = client.id;
        clientName = client.name;
      }
    }
  }

  const dueDate =
    typeof input.due_date === "string" && !Number.isNaN(Date.parse(input.due_date)) ? input.due_date : null;

  const taskType = typeof input.task_type === "string" && TASK_TYPES.includes(input.task_type) ? input.task_type : "general_task";
  const priority = typeof input.priority === "string" && ["low", "normal", "high"].includes(input.priority) ? input.priority : "normal";

  return {
    status: "ready",
    action: {
      type: "create_task",
      title,
      client_id: clientId,
      client_name: clientName,
      opportunity_id: opportunityId,
      opportunity_title: opportunityTitle,
      due_date: dueDate,
      task_type: taskType,
      priority,
    },
  };
}

/**
 * Resolve-only — never writes. Validates project_id and (if given) category
 * against the real, RLS-scoped data and returns either a ready-to-confirm
 * proposal or a specific, honest reason it couldn't resolve one. The actual
 * insert happens later, in index.ts's executeCreateExpense(), only after
 * the user confirms — never from here.
 */
async function createExpenseTool(
  input: { project_id?: string; name?: string; amount?: number; category?: string; date?: string },
  sb: SupabaseClient,
) {
  const projectId = typeof input.project_id === "string" ? input.project_id : "";
  if (!projectId) return { status: "error", reason: "invalid_input", message: "project_id is required." };

  const { data: project, error: pErr } = await sb.from("projects").select("id,name").eq("id", projectId).single();
  if (pErr || !project) {
    return { status: "error", reason: "project_not_found", message: "That project wasn't found." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { status: "error", reason: "invalid_input", message: "An expense name/label is required." };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: "error", reason: "invalid_amount", message: "The amount must be a number greater than 0." };
  }

  let expenseCategoryId: string | null = null;
  let categoryName: string | null = null;
  if (typeof input.category === "string" && input.category.trim()) {
    const needle = input.category.trim().toLowerCase();
    const { data: categories, error: cErr } = await sb.from("expense_categories").select("id,name");
    if (cErr) throw cErr;
    // deno-lint-ignore no-explicit-any
    const match = (categories ?? []).find((c: any) => c.name.toLowerCase() === needle);
    if (!match) {
      return {
        status: "error",
        reason: "category_not_found",
        message: `No expense category named "${input.category}" — ask the user to pick from the real list.`,
        // deno-lint-ignore no-explicit-any
        available_categories: (categories ?? []).map((c: any) => c.name),
      };
    }
    expenseCategoryId = match.id;
    categoryName = match.name;
  }

  let date = typeof input.date === "string" && input.date.trim() ? input.date.trim() : "";
  let dateWasDefaulted = false;
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
    dateWasDefaulted = true;
  }

  return {
    status: "ready",
    action: {
      type: "create_expense",
      project_id: project.id,
      project_name: project.name,
      name,
      amount,
      expense_category_id: expenseCategoryId,
      category_name: categoryName,
      date,
      date_was_defaulted: dateWasDefaulted,
    },
  };
}

export async function callTool(name: string, input: Record<string, unknown>, sb: SupabaseClient): Promise<unknown> {
  switch (name) {
    // deno-lint-ignore no-explicit-any
    case "list_projects":
      return listProjects(input as any, sb);
    case "get_project_financials":
      // deno-lint-ignore no-explicit-any
      return getProjectFinancials(input as any, sb);
    case "search_quotes":
      // deno-lint-ignore no-explicit-any
      return searchQuotes(input as any, sb);
    case "get_quote_detail":
      // deno-lint-ignore no-explicit-any
      return getQuoteDetail(input as any, sb);
    case "search_invoices":
      // deno-lint-ignore no-explicit-any
      return searchInvoices(input as any, sb);
    case "list_expenses":
      // deno-lint-ignore no-explicit-any
      return listExpensesTool(input as any, sb);
    case "get_client_detail":
      // deno-lint-ignore no-explicit-any
      return getClientDetail(input as any, sb);
    case "revenue_summary":
      // deno-lint-ignore no-explicit-any
      return revenueSummaryTool(input as any, sb);
    case "get_job_closeouts":
      // deno-lint-ignore no-explicit-any
      return getJobCloseouts(input as any, sb);
    case "get_needs_attention":
      // deno-lint-ignore no-explicit-any
      return getNeedsAttention(input as any, sb);
    case "create_expense":
      // deno-lint-ignore no-explicit-any
      return createExpenseTool(input as any, sb);
    case "list_opportunities":
      // deno-lint-ignore no-explicit-any
      return listOpportunitiesTool(input as any, sb);
    case "get_pipeline_summary":
      // deno-lint-ignore no-explicit-any
      return getPipelineSummaryTool(input as any, sb);
    case "create_task":
      // deno-lint-ignore no-explicit-any
      return createTaskTool(input as any, sb);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
