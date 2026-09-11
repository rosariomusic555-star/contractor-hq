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
  invoiceDaysLate,
  materialsCogs,
  momChange,
  monthlyRevenue,
  pickHeadlineQuote,
  quoteItemIncluded,
  quoteLineTotal,
  quoteTotal,
  revenueByCategory,
  type QuoteLike,
} from "./format.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const TOOLS = [
  {
    name: "list_projects",
    description:
      "List the contractor's projects/jobs, optionally filtered by status or a text search on the project name. Use this to resolve a job mentioned by name (e.g. 'the Miller job') to a project_id before calling get_project_financials.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "quote_sent", "approved", "invoiced", "paid"] },
        search: { type: "string", description: "Case-insensitive substring match on the project name." },
      },
    },
  },
  {
    name: "get_project_financials",
    description:
      "Get the quoted total, predicted cost (from the Materials Sheet), actual cost-to-date (from logged expenses), and predicted/actual profit and margin for one project. This is the tool for any 'margin', 'profit', or 'how much have I spent on X job' question.",
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
      "Look up a client by name (fuzzy search) or by client_id. If a name search matches more than one client, returns the candidate list instead of picking one — call again with the specific client_id. Returns contact info plus their projects, quote/invoice counts, and lifetime value (sum of their paid invoices).",
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
      "Monthly invoiced-revenue totals (and month-over-month change) over an optional date range, with an optional breakdown by work category.",
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
    name: "get_needs_attention",
    description:
      "The exact same 'needs your attention' list shown on the dashboard: invoices overdue 3+ days, quotes shared 3+ days ago with no response yet, and approved quotes that haven't been billed a deposit. This is the tool for 'which quotes haven't I followed up on' and similar questions.",
    input_schema: { type: "object", properties: {} },
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

async function listProjects(input: { status?: string; search?: string }, sb: SupabaseClient) {
  let q = sb
    .from("projects")
    .select("id,name,status,created_at,updated_at,client:clients(name)")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (input.status) q = q.eq("status", input.status);
  if (input.search) q = q.ilike("name", `%${input.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    client_name: p.client?.name ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

async function getProjectFinancials(input: { project_id: string }, sb: SupabaseClient) {
  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id,name,status,client:clients(name)")
    .eq("id", input.project_id)
    .single();
  if (pErr) throw pErr;

  const { data: quotes, error: qErr } = await sb
    .from("quotes")
    .select("id,status,created_at,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected))")
    .eq("project_id", input.project_id);
  if (qErr) throw qErr;

  const headline = pickHeadlineQuote((quotes ?? []) as QuoteLike[]);
  const quoted = headline ? quoteTotal(headline.quote_sections) : null;

  const { data: materialsSections, error: mErr } = await sb
    .from("materials_sections")
    .select("materials_items(quantity,unit_cost)")
    .eq("project_id", input.project_id);
  if (mErr) throw mErr;
  // deno-lint-ignore no-explicit-any
  const materialsItemCount = (materialsSections ?? []).reduce((s: number, sec: any) => s + (sec.materials_items?.length ?? 0), 0);
  const predictedCost = materialsItemCount > 0 ? materialsCogs(materialsSections ?? []) : null;

  const { data: expenses, error: eErr } = await sb
    .from("expenses")
    .select("name,amount,date,created_at")
    .eq("project_id", input.project_id)
    .order("created_at", { ascending: false });
  if (eErr) throw eErr;
  // deno-lint-ignore no-explicit-any
  const expensesTotal = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const actualCost = (expenses ?? []).length > 0 ? expensesTotal : null;

  const marginPct = (cost: number | null) =>
    quoted != null && quoted > 0 && cost != null ? Math.round(((quoted - cost) / quoted) * 100) : null;

  return {
    project_name: project.name,
    status: project.status,
    client_name: project.client?.name ?? null,
    quoted_total: quoted,
    predicted_cost: predictedCost,
    actual_cost_to_date: actualCost,
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
    .select("id,name,amount,date,created_at,project:projects(name),expense_category:expense_categories(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (input.project_id) q = q.eq("project_id", input.project_id);
  if (input.date_from) q = q.gte("created_at", input.date_from);
  if (input.date_to) q = q.lte("created_at", input.date_to);
  const { data, error } = await q;
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  let rows = (data ?? []).map((e: any) => ({
    id: e.id,
    name: e.name,
    amount: Number(e.amount),
    date: e.date,
    project_name: e.project?.name ?? null,
    category: e.expense_category?.name ?? "Uncategorized",
    created_at: e.created_at,
  }));
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
  const { data: projects, error: projErr } = await sb
    .from("projects")
    .select("id,name,status")
    .eq("client_id", client.id);
  if (projErr) throw projErr;
  // deno-lint-ignore no-explicit-any
  const projectIds = (projects ?? []).map((p: any) => p.id);

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

  const lifetimeValuePaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount), 0);

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
  // "Revenue invoiced" (matches the Dashboard's own label) — every non-draft
  // invoice, not just paid ones. See src/lib/metrics.ts monthlyRevenue().
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

  if (input.by_category) {
    const { data: quotes, error: qErr } = await sb
      .from("quotes")
      .select("id,status,created_at,quote_sections(is_optional,quote_items(price,quantity,is_optional,client_selected,category_id))");
    if (qErr) throw qErr;
    const { data: categories, error: cErr } = await sb.from("categories").select("id,name");
    if (cErr) throw cErr;
    // Category revenue counts a quote once it's fully paid, independent of
    // any date range — same semantics as src/lib/metrics.ts revenueByCategory().
    const { data: allInvoices, error: aErr } = await sb.from("invoices").select("amount,status,quote_id");
    if (aErr) throw aErr;
    result.by_category = revenueByCategory(quotes ?? [], allInvoices ?? [], categories ?? []);
  }

  return result;
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
    .select("id,status,amount,due_date,quote_id,project_id,project:projects(name)");
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
      amount: Number(invoice.amount),
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

  return { overdue_invoices: overdueInvoices, quote_followups: quoteFollowups, deposits_due: depositsDue };
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
    case "get_needs_attention":
      // deno-lint-ignore no-explicit-any
      return getNeedsAttention(input as any, sb);
    case "create_expense":
      // deno-lint-ignore no-explicit-any
      return createExpenseTool(input as any, sb);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
