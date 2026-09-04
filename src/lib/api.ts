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
  price: number;
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
  project_id: string;
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
}

export interface Invoice {
  id: string;
  project_id: string;
  quote_id: string | null;
  user_id: string;
  amount: number;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
  share_token: string | null;
  paid_at: string | null;
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

// ---------------------------------------------------------------------------
// Derived amounts
// ---------------------------------------------------------------------------

/** Whether a line item counts toward the quote total given its section. */
export function quoteItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  if (section.is_optional || item.is_optional) return item.client_selected;
  return true;
}

/** Quote total = sum of included line items (quotes have no stored amount). */
export function quoteTotal(sections: QuoteSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.quote_items ?? []) {
      if (quoteItemIncluded(section, item)) total += Number(item.price);
    }
  }
  return total;
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

const PROJECT_SELECT = "*, client:clients(name)";

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
  "*, project:projects(name, client:clients(name)), quote_sections(*, quote_items(*))";

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

/** Create a quote for a project. Starts with no sections, like the materials sheet. */
export async function createQuote(projectId: string): Promise<Quote> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({ project_id: projectId })
    .select("id")
    .single();
  if (error) throw error;
  return getQuote(quote.id);
}

/** The project's quote, creating one (draft, no sections) if it doesn't exist yet. */
export async function getOrCreateQuote(projectId: string): Promise<Quote> {
  const existing = await listQuotes(projectId);
  if (existing[0]) return existing[0];
  return createQuote(projectId);
}

export async function updateQuote(
  id: string,
  patch: Partial<Pick<Quote, "status" | "deposit_percentage" | "notes" | "terms">>,
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
    Pick<QuoteItem, "name" | "description" | "price" | "is_optional" | "client_selected" | "sort_order">
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

export async function createInvoice(input: {
  project_id: string;
  amount: number;
  due_date?: string | null;
  quote_id?: string | null;
  notes?: string | null;
}): Promise<Invoice> {
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      project_id: input.project_id,
      amount: input.amount,
      due_date: input.due_date ?? null,
      quote_id: input.quote_id ?? null,
      notes: input.notes ?? null,
    })
    .select(INVOICE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoice(
  id: string,
  patch: Partial<Pick<Invoice, "amount" | "status" | "due_date" | "notes" | "paid_at">>,
): Promise<void> {
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
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
  project: { name: string };
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
