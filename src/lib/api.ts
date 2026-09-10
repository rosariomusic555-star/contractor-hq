import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectStatus = "draft" | "quote_sent" | "approved" | "invoiced" | "paid";
export type QuoteStatus = "draft" | "sent" | "approved";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface ClientRef {
  name: string;
  // Only populated where the select asks for them (e.g. PROJECT_SELECT).
  // Quote / invoice selects fetch `name` alone and leave these undefined.
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}
interface ProjectRef {
  name: string;
  client: ClientRef | null;
}

export interface Project {
  id: string;
  user_id: string;
  client_id: string | null;
  name: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  client?: ClientRef | null;
}

export interface QuoteItem {
  id: string;
  section_id: string;
  name: string;
  description: string | null;
  /** Unit price. Line total = quantity × price. */
  price: number;
  quantity: number;
  /** Free-text unit of measure (sf, cy, lf, ea…). Label only — not in the math. */
  unit: string | null;
  is_optional: boolean;
  client_selected: boolean;
  sort_order: number;
}

export interface QuoteSection {
  id: string;
  quote_id: string;
  name: string;
  is_optional: boolean;
  sort_order: number;
  quote_items: QuoteItem[];
}

export interface Quote {
  id: string;
  // Nullable — a quote can stand alone, with no project. See
  // profitQuotedTotal-adjacent selection helpers and QuoteWorkspace, which
  // both branch on this being null.
  project_id: string | null;
  // Direct client, independent of any project. Standalone quotes rely on
  // this entirely; project-linked quotes can leave it null and fall back
  // to the project's client (see get_shared_quote's coalesce), or set it
  // directly to override.
  client_id: string | null;
  user_id: string;
  status: QuoteStatus;
  deposit_percentage: number;
  notes: string | null;
  terms: string | null;
  share_token: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  quote_sections: QuoteSection[];
  project?: ProjectRef | null;
  client?: ClientRef | null;
}

export interface Invoice {
  id: string;
  // Nullable — an invoice can stand alone, with no project.
  project_id: string | null;
  quote_id: string | null;
  user_id: string;
  amount: number;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
  share_token: string | null;
  paid_at: string | null;
  // Display number ("INV-001", …), set once at creation from the count of
  // invoices already on the project. Frozen — doesn't shift if an earlier
  // invoice is later deleted.
  invoice_number: string | null;
  created_at: string;
  updated_at: string;
  project?: ProjectRef | null;
}

export interface MaterialsItem {
  id: string;
  section_id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
}

export interface MaterialsSection {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  materials_items: MaterialsItem[];
}

export interface Expense {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  amount: number;
  // For the contractor's reference only — never used in any calculation.
  date: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Derived amounts
// ---------------------------------------------------------------------------

/** Whether a line item counts toward the quote total given its section. */
export function quoteItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  if (section.is_optional || item.is_optional) return item.client_selected;
  return true;
}

/** Line total = quantity × unit price. Quantity defaults to 1 (pre-0014 rows). */
export function quoteLineTotal(item: { price: number; quantity?: number | null }): number {
  return Number(item.price) * (item.quantity == null ? 1 : Number(item.quantity));
}

/** Quote total = sum of included line items (quotes have no stored amount). */
export function quoteTotal(sections: QuoteSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.quote_items ?? []) {
      if (quoteItemIncluded(section, item)) total += quoteLineTotal(item);
    }
  }
  return total;
}

/**
 * Which quote represents "the" quote for a project when there can be many:
 * the most recently approved one; failing that, the most recently sent one;
 * failing that, the most recent draft. Used by the Profit Summary card and
 * the Quotes hub-card summary so both agree on the same headline quote.
 */
export function pickHeadlineQuote(quotes: Quote[]): Quote | undefined {
  const byRecency = (a: Quote, b: Quote) => b.created_at.localeCompare(a.created_at);
  const mostRecentWithStatus = (status: QuoteStatus) =>
    quotes.filter((q) => q.status === status).sort(byRecency)[0];
  return (
    mostRecentWithStatus("approved") ?? mostRecentWithStatus("sent") ?? mostRecentWithStatus("draft")
  );
}

/** Materials cost of goods = sum of quantity * unit_cost across all items. */
export function materialsCogs(sections: MaterialsSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.materials_items ?? []) {
      total += Number(item.quantity) * Number(item.unit_cost);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createClient(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClient(
  id: string,
  patch: Partial<Pick<Client, "name" | "email" | "phone" | "address">>,
): Promise<void> {
  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const PROJECT_SELECT = "*, client:clients(name, email, phone, address)";

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject(input: {
  name: string;
  client_id: string | null;
  status?: ProjectStatus;
}): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      client_id: input.client_id,
      status: input.status ?? "draft",
    })
    .select(PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, "name" | "client_id" | "status">>,
): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Materials sheet
// ---------------------------------------------------------------------------

export async function listMaterials(projectId: string): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select("*, materials_items(*)")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createMaterialsSection(
  projectId: string,
  input: { name: string; sort_order?: number },
): Promise<MaterialsSection> {
  const { data, error } = await supabase
    .from("materials_sections")
    .insert({
      project_id: projectId,
      name: input.name,
      sort_order: input.sort_order ?? 0,
    })
    .select("*, materials_items(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialsSection(
  id: string,
  patch: Partial<Pick<MaterialsSection, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("materials_sections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterialsSection(id: string): Promise<void> {
  const { error } = await supabase.from("materials_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function addMaterialsItem(
  sectionId: string,
  input: { name?: string; quantity?: number; unit_cost?: number; sort_order?: number },
): Promise<MaterialsItem> {
  const { data, error } = await supabase
    .from("materials_items")
    .insert({
      section_id: sectionId,
      name: input.name ?? "",
      quantity: input.quantity ?? 0,
      unit_cost: input.unit_cost ?? 0,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialsItem(
  id: string,
  patch: Partial<Pick<MaterialsItem, "name" | "quantity" | "unit_cost" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("materials_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterialsItem(id: string): Promise<void> {
  const { error } = await supabase.from("materials_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

const QUOTE_SELECT =
  "*, project:projects(name, client:clients(name)), client:clients(name), quote_sections(*, quote_items(*))";

function sortQuote(quote: Quote): Quote {
  quote.quote_sections?.sort((a, b) => a.sort_order - b.sort_order);
  for (const s of quote.quote_sections ?? []) {
    s.quote_items?.sort((a, b) => a.sort_order - b.sort_order);
  }
  return quote;
}

export async function listQuotes(projectId?: string): Promise<Quote[]> {
  let query = supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .order("updated_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(sortQuote);
}

export async function getQuote(id: string): Promise<Quote> {
  const { data, error } = await supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return sortQuote(data);
}

// ---------------------------------------------------------------------------
// Quote defaults (Settings > Quote defaults) — one row per user. Falls back
// to QUOTE_DEFAULTS_FALLBACK before the user has ever saved a row.
// ---------------------------------------------------------------------------

export interface QuoteDefaults {
  deposit_pct: number;
  quote_validity_days: number;
  sales_tax_pct: number;
  terms: string | null;
}

export const QUOTE_DEFAULTS_FALLBACK: QuoteDefaults = {
  deposit_pct: 30,
  quote_validity_days: 14,
  sales_tax_pct: 6.25,
  terms:
    "Prices hold for 14 days. Excavation assumes no ledge or buried utilities; unforeseen conditions billed hourly plus materials. 5-year workmanship warranty on base and installation; manufacturer warranty on all paver and wall product.",
};

export async function getQuoteDefaults(): Promise<QuoteDefaults> {
  const { data, error } = await supabase.from("quote_defaults").select("*").maybeSingle();
  if (error) {
    // PGRST205 = "table not found in schema cache" — migration 0016 hasn't
    // been run yet. Degrade to the fallback instead of breaking every screen
    // that reads quote defaults (Quote Builder, createQuote()).
    if (error.code === "PGRST205") return QUOTE_DEFAULTS_FALLBACK;
    throw error;
  }
  if (!data) return QUOTE_DEFAULTS_FALLBACK;
  return {
    deposit_pct: Number(data.deposit_pct),
    quote_validity_days: Number(data.quote_validity_days),
    sales_tax_pct: Number(data.sales_tax_pct),
    terms: data.terms ?? null,
  };
}

export async function saveQuoteDefaults(patch: Partial<QuoteDefaults>): Promise<QuoteDefaults> {
  const merged = { ...(await getQuoteDefaults()), ...patch };
  const { data, error } = await supabase
    .from("quote_defaults")
    .upsert({
      deposit_pct: merged.deposit_pct,
      quote_validity_days: merged.quote_validity_days,
      sales_tax_pct: merged.sales_tax_pct,
      terms: merged.terms,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    deposit_pct: Number(data.deposit_pct),
    quote_validity_days: Number(data.quote_validity_days),
    sales_tax_pct: Number(data.sales_tax_pct),
    terms: data.terms ?? null,
  };
}

/**
 * Create a quote — status 'draft', no sections yet. project_id and client_id
 * are both optional: a quote can stand alone with neither, be linked to a
 * project only (client resolved via the project at share time), or carry
 * its own client_id independent of any project. deposit_percentage/terms
 * fall back to the user's saved Quote defaults (Settings), not a hardcoded
 * number, so a new quote is actually pre-filled from what's configured there.
 */
export async function createQuote(
  input: {
    project_id?: string | null;
    client_id?: string | null;
    deposit_percentage?: number;
    notes?: string | null;
    terms?: string | null;
  } = {},
): Promise<Quote> {
  const defaults = await getQuoteDefaults();
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      project_id: input.project_id ?? null,
      client_id: input.client_id ?? null,
      deposit_percentage: input.deposit_percentage ?? defaults.deposit_pct,
      notes: input.notes ?? null,
      terms: input.terms ?? defaults.terms,
    })
    .select("id")
    .single();
  if (error) throw error;
  return getQuote(quote.id);
}

export async function updateQuote(
  id: string,
  patch: Partial<
    Pick<Quote, "status" | "deposit_percentage" | "notes" | "terms" | "client_id" | "project_id">
  >,
): Promise<void> {
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quote sections & items
// ---------------------------------------------------------------------------

export async function addQuoteSection(
  quoteId: string,
  input: { name: string; is_optional?: boolean; sort_order?: number },
): Promise<QuoteSection> {
  const { data, error } = await supabase
    .from("quote_sections")
    .insert({
      quote_id: quoteId,
      name: input.name,
      is_optional: input.is_optional ?? false,
      sort_order: input.sort_order ?? 0,
    })
    .select("*, quote_items(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuoteSection(
  id: string,
  patch: Partial<Pick<QuoteSection, "name" | "is_optional" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("quote_sections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuoteSection(id: string): Promise<void> {
  const { error } = await supabase.from("quote_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function addQuoteItem(
  sectionId: string,
  input: {
    name: string;
    description?: string | null;
    price: number;
    quantity?: number;
    unit?: string | null;
    is_optional?: boolean;
    sort_order?: number;
  },
): Promise<QuoteItem> {
  const { data, error } = await supabase
    .from("quote_items")
    .insert({
      section_id: sectionId,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      is_optional: input.is_optional ?? false,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuoteItem(
  id: string,
  patch: Partial<
    Pick<
      QuoteItem,
      | "name"
      | "description"
      | "price"
      | "quantity"
      | "unit"
      | "is_optional"
      | "client_selected"
      | "sort_order"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("quote_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuoteItem(id: string): Promise<void> {
  const { error } = await supabase.from("quote_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const INVOICE_SELECT = "*, project:projects(name, client:clients(name))";

export async function listInvoices(projectId?: string): Promise<Invoice[]> {
  let query = supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Create an invoice — status 'draft', amount 0, no project unless given.
 * invoice_number ("INV-001", "INV-002", …) is set once here and stored on
 * the row — the public share page can't otherwise derive it (RLS keeps it
 * from seeing an invoice's sibling invoices) — counted among invoices on the
 * same project, or among other standalone (project-less) invoices when
 * there's no project. Amount/due date/notes/project link are all editable
 * afterward in the Invoice Workspace, same as a blank quote.
 */
export async function createInvoice(
  input: {
    project_id?: string | null;
    amount?: number;
    due_date?: string | null;
    quote_id?: string | null;
    notes?: string | null;
  } = {},
): Promise<Invoice> {
  let countQuery = supabase.from("invoices").select("id", { count: "exact", head: true });
  countQuery = input.project_id
    ? countQuery.eq("project_id", input.project_id)
    : countQuery.is("project_id", null);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;
  const invoice_number = `INV-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      project_id: input.project_id ?? null,
      amount: input.amount ?? 0,
      due_date: input.due_date ?? null,
      quote_id: input.quote_id ?? null,
      notes: input.notes ?? null,
      invoice_number,
    })
    .select(INVOICE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoice(
  id: string,
  patch: Partial<
    Pick<Invoice, "amount" | "status" | "due_date" | "notes" | "paid_at" | "project_id" | "quote_id">
  >,
): Promise<void> {
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(projectId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * expenses.user_id has no `default auth.uid()` (unlike clients/projects/
 * quotes/invoices), so it has to be set explicitly here from the current
 * session — RLS's WITH CHECK rejects the insert otherwise.
 */
export async function createExpense(input: {
  project_id: string;
  name: string;
  amount: number;
  date?: string | null;
}): Promise<Expense> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      project_id: input.project_id,
      user_id: user.id,
      name: input.name,
      amount: input.amount,
      date: input.date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Project activity log (0013). Written by the app when things happen; the
// project page and the invoice page both read from it.
// ---------------------------------------------------------------------------

export type ProjectEventKind =
  | "project_created"
  | "status_changed"
  | "quote_sent"
  | "quote_signed"
  | "invoice_created"
  | "invoice_sent"
  | "invoice_paid"
  | "expense_logged";

export interface ProjectEvent {
  id: string;
  project_id: string;
  user_id: string;
  kind: ProjectEventKind;
  summary: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export async function listProjectEvents(projectId: string): Promise<ProjectEvent[]> {
  const { data, error } = await supabase
    .from("project_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fire-and-forget: record an activity event. Callers `void logProjectEvent(...)`
 * from a mutation's onSuccess so a logging failure never fails the real action.
 * A null projectId (standalone quote/invoice) is a no-op.
 */
export async function logProjectEvent(
  projectId: string | null | undefined,
  kind: ProjectEventKind,
  summary: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase
    .from("project_events")
    .insert({ project_id: projectId, kind, summary, meta });
  if (error) console.warn("logProjectEvent failed:", error.message);
}

// ---------------------------------------------------------------------------
// Share links (owner side). Client-facing reads go through RPCs (phase 3).
// ---------------------------------------------------------------------------

export async function generateShareLink(
  kind: "quotes" | "invoices",
  id: string,
): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await supabase.from(kind).update({ share_token: token }).eq("id", id);
  if (error) throw error;
  return token;
}

export async function revokeShareLink(kind: "quotes" | "invoices", id: string): Promise<void> {
  const { error } = await supabase.from(kind).update({ share_token: null }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Client-facing share page (anon, no session). All reads/writes go through
// the SECURITY DEFINER RPCs from 0004/0007 — base-table RLS never grants
// anon anything directly; the token is the only credential.
// ---------------------------------------------------------------------------

export interface SharedQuoteItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  unit: string | null;
  is_optional: boolean;
  client_selected: boolean;
  sort_order: number;
}

export interface SharedQuoteSection {
  id: string;
  name: string;
  is_optional: boolean;
  sort_order: number;
  items: SharedQuoteItem[];
}

export interface SharedQuote {
  quote: {
    id: string;
    status: QuoteStatus;
    deposit_percentage: number;
    notes: string | null;
    terms: string | null;
    signed_at: string | null;
    signed_by: string | null;
    created_at: string;
    updated_at: string;
  };
  // Null for a standalone quote (no linked project).
  project: { name: string } | null;
  client: { name: string } | null;
  sections: SharedQuoteSection[];
}

export async function getSharedQuote(token: string): Promise<SharedQuote | null> {
  const { data, error } = await supabase.rpc("get_shared_quote", { p_token: token });
  if (error) throw error;
  return (data as SharedQuote | null) ?? null;
}

// Note: which optional sections/items the client has checked is kept as
// local view state on the share page only (never written back) — see
// SharedQuotePage. The only client-facing write is signSharedQuote below.

export async function signSharedQuote(token: string, signedBy: string): Promise<void> {
  const { error } = await supabase.rpc("sign_quote", { p_token: token, p_signed_by: signedBy });
  if (error) throw error;
}

export interface SharedInvoice {
  invoice: {
    id: string;
    status: InvoiceStatus;
    amount: number;
    due_date: string | null;
    notes: string | null;
    paid_at: string | null;
    invoice_number: string | null;
    created_at: string;
    updated_at: string;
  };
  // Null for a standalone invoice (no linked project).
  project: { name: string } | null;
  client: { name: string } | null;
}

export async function getSharedInvoice(token: string): Promise<SharedInvoice | null> {
  const { data, error } = await supabase.rpc("get_shared_invoice", { p_token: token });
  if (error) throw error;
  return (data as SharedInvoice | null) ?? null;
}
