import { supabase } from "./supabase";
import { compressImageFile, randomImageFilename } from "./imageUpload";

/** Private Storage bucket (0023) holding both quote-item and project
 * photos, split by path prefix (`quote-items/…`, `projects/…`). */
const IMAGES_BUCKET = "images";

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

/** A user's own editable list of work categories (Settings > Categories). */
export interface Category {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
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

/** A photo in a project's gallery (progress photos, before/after, site
 * conditions…). Multiple per project, each with an optional caption.
 * `storage_path` is a path into the `images` Storage bucket (0023) —
 * resolve to a viewable URL with getSignedImageUrls(). */
export interface ProjectImage {
  id: string;
  project_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

/** A photo attached to a quote line item (paver style, area being worked
 * on…). Multiple per item. `storage_path` is a path into the `images`
 * Storage bucket (0023) — resolve to a viewable URL with getSignedImageUrls(). */
export interface QuoteItemImage {
  id: string;
  quote_item_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
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
  /** Optional work category (Settings > Categories). Null = uncategorized. */
  category_id: string | null;
  quote_item_images: QuoteItemImage[];
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

/** A user's own editable list of cost categories (Settings > Expense
 * categories) — distinct from `Category` (work-type tags on quote line
 * items, driving revenue-by-category). No relation between the two. */
export interface ExpenseCategory {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

/** A user's own saved material (Settings > Price Book), picked from the
 * Materials Sheet to auto-fill a line item instead of retyping it. Never
 * seeded — starts empty for every user. */
export interface PriceBookItem {
  id: string;
  user_id: string;
  name: string;
  unit: string | null;
  unit_price: number;
  /** "Required" is enforced in the Settings form, not the DB — see 0027. */
  expense_category_id: string | null;
  created_at: string;
}

export interface MaterialsItem {
  id: string;
  section_id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
  /** Optional cost category (Settings > Expense categories). Null = uncategorized. */
  expense_category_id: string | null;
  /** Free-text unit of measure (sf, cy, bag, lf, ea…). Label only — not in the math. */
  unit: string | null;
  /** Set when this line was picked from the Price Book — the Materials
   * Sheet locks expense_category_id while this is set. Null = a normal,
   * fully custom line (or a price-book pick that's since been unlinked). */
  price_book_item_id: string | null;
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
  /** Optional cost category (Settings > Expense categories). Null = uncategorized. */
  expense_category_id: string | null;
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
// Categories (Settings > Categories) — seeded per-user by a DB trigger on
// signup (0018). Deleting one sets quote_items.category_id to null on any
// line items that referenced it (0019's on delete set null) — those items
// just become uncategorized, no reassignment step needed here.
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) {
    // PGRST205 = "table not found in schema cache" — migration 0017 hasn't
    // been run yet. Degrade to empty instead of breaking every quote screen
    // and the Money page, same as getQuoteDefaults().
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createCategory(input: { name: string; sort_order?: number }): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: input.name, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
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

/**
 * Best-effort cleans up this project's own gallery images in Storage before
 * the (cascading) delete — see deleteQuoteSection's doc comment. Note: a
 * project's quotes/sections/items/quote_item_images cascade-delete too, and
 * any quote-item photos on them are NOT cleaned up here (that would need
 * walking the full quotes → sections → items chain) — an accepted, rare
 * edge case rather than risking a fragile deep-join cleanup query.
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const { data: images } = await supabase
      .from("project_images")
      .select("storage_path")
      .eq("project_id", id);
    if (images?.length) {
      await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
    }
  } catch (err) {
    console.warn("Failed to clean up project images before deleting project:", err);
  }
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Project images — a project's photo gallery (0025): progress photos,
// before/after, site conditions. Multiple per project, each with an
// optional caption.
// ---------------------------------------------------------------------------

export async function listProjectImages(projectId: string): Promise<ProjectImage[]> {
  const { data, error } = await supabase
    .from("project_images")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) {
    // PGRST205 = "table not found in schema cache" — migration 0025 hasn't
    // been run yet. Degrade to empty instead of breaking the project page,
    // same as listCategories()/listExpenseCategories().
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** Compresses, uploads, and records the row — same order/rollback as
 * uploadQuoteItemImage. */
export async function addProjectImage(
  projectId: string,
  file: File,
  input: { caption?: string | null; sort_order?: number } = {},
): Promise<ProjectImage> {
  const compressed = await compressImageFile(file);
  const path = `projects/${projectId}/${randomImageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("project_images")
    .insert({
      project_id: projectId,
      storage_path: path,
      caption: input.caption ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function updateProjectImageCaption(id: string, caption: string | null): Promise<void> {
  const { error } = await supabase.from("project_images").update({ caption }).eq("id", id);
  if (error) throw error;
}

export async function deleteProjectImage(
  image: Pick<ProjectImage, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .remove([image.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("project_images").delete().eq("id", image.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Expense categories (Settings > Expense categories) — cost/material tags
// for expenses and Materials Sheet line items. Seeded per-user by a DB
// trigger on signup (0021), completely separate from `categories` (work-type
// tags on quote line items — see that type's doc comment). Deleting one sets
// expense_category_id to null on any expenses/materials_items that
// referenced it (0022's on delete set null) — no reassignment step needed.
// ---------------------------------------------------------------------------

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase.from("expense_categories").select("*").order("sort_order");
  if (error) {
    // PGRST205 = "table not found in schema cache" — migration 0020 hasn't
    // been run yet. Degrade to empty instead of breaking every expense/
    // materials screen, same as listCategories()/getQuoteDefaults().
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createExpenseCategory(input: {
  name: string;
  sort_order?: number;
}): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ name: input.name, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpenseCategory(
  id: string,
  patch: Partial<Pick<ExpenseCategory, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("expense_categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase.from("expense_categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Price Book (Settings > Price Book, 0027) — a user's own saved materials,
// picked from the Materials Sheet to auto-fill a line instead of retyping
// it every job. Never seeded. expense_category_id is "required" only in the
// Settings form — the column itself is nullable (see 0027's header comment)
// so deleting a category never blocks or errors, same as everywhere else.
// ---------------------------------------------------------------------------

export async function listPriceBookItems(): Promise<PriceBookItem[]> {
  const { data, error } = await supabase.from("price_book").select("*").order("name");
  if (error) {
    // PGRST205 = "table not found in schema cache" — migration 0027 hasn't
    // been run yet. Degrade to empty instead of breaking the Materials
    // Sheet and Settings > Price Book, same as listExpenseCategories().
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createPriceBookItem(input: {
  name: string;
  unit?: string | null;
  unit_price: number;
  expense_category_id: string | null;
}): Promise<PriceBookItem> {
  const { data, error } = await supabase
    .from("price_book")
    .insert({
      name: input.name,
      unit: input.unit ?? null,
      unit_price: input.unit_price,
      expense_category_id: input.expense_category_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePriceBookItem(
  id: string,
  patch: Partial<Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id">>,
): Promise<void> {
  const { error } = await supabase.from("price_book").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePriceBookItem(id: string): Promise<void> {
  const { error } = await supabase.from("price_book").delete().eq("id", id);
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
  input: {
    name?: string;
    quantity?: number;
    unit_cost?: number;
    sort_order?: number;
    expense_category_id?: string | null;
    unit?: string | null;
    price_book_item_id?: string | null;
  },
): Promise<MaterialsItem> {
  const { data, error } = await supabase
    .from("materials_items")
    .insert({
      section_id: sectionId,
      name: input.name ?? "",
      quantity: input.quantity ?? 0,
      unit_cost: input.unit_cost ?? 0,
      sort_order: input.sort_order ?? 0,
      expense_category_id: input.expense_category_id ?? null,
      unit: input.unit ?? null,
      price_book_item_id: input.price_book_item_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialsItem(
  id: string,
  patch: Partial<
    Pick<
      MaterialsItem,
      | "name"
      | "quantity"
      | "unit_cost"
      | "sort_order"
      | "expense_category_id"
      | "unit"
      | "price_book_item_id"
    >
  >,
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
  "*, project:projects(name, client:clients(name)), client:clients(name), quote_sections(*, quote_items(*, quote_item_images(*)))";
// Fallback for when migration 0024 (quote_item_images) hasn't been run yet.
// Unlike a merely-missing column (which PostgREST just omits), an embedded
// resource it can't resolve in its schema cache fails the WHOLE query — so
// unlike every other not-yet-migrated fallback in this file, this can't
// just catch-and-return-empty at the call site; listQuotes/getQuote retry
// once without the embed below.
const QUOTE_SELECT_NO_IMAGES =
  "*, project:projects(name, client:clients(name)), client:clients(name), quote_sections(*, quote_items(*))";

function sortQuote(quote: Quote): Quote {
  quote.quote_sections?.sort((a, b) => a.sort_order - b.sort_order);
  for (const s of quote.quote_sections ?? []) {
    s.quote_items?.sort((a, b) => a.sort_order - b.sort_order);
    for (const i of s.quote_items ?? []) {
      // Absent entirely when the QUOTE_SELECT_NO_IMAGES fallback fired.
      i.quote_item_images = i.quote_item_images ?? [];
      i.quote_item_images.sort((a, b) => a.sort_order - b.sort_order);
    }
  }
  return quote;
}

/** PGRST200 = "could not find a relationship … in the schema cache". */
const isMissingRelationshipError = (error: { code?: string } | null) => error?.code === "PGRST200";

export async function listQuotes(projectId?: string): Promise<Quote[]> {
  const build = (select: string) => {
    let query = supabase.from("quotes").select(select).order("updated_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  };
  const { data, error } = await build(QUOTE_SELECT);
  if (!error) return (data ?? []).map(sortQuote);
  if (!isMissingRelationshipError(error)) throw error;
  const { data: fallback, error: fallbackError } = await build(QUOTE_SELECT_NO_IMAGES);
  if (fallbackError) throw fallbackError;
  return (fallback ?? []).map(sortQuote);
}

export async function getQuote(id: string): Promise<Quote> {
  const { data, error } = await supabase.from("quotes").select(QUOTE_SELECT).eq("id", id).single();
  if (!error) return sortQuote(data);
  if (!isMissingRelationshipError(error)) throw error;
  const { data: fallback, error: fallbackError } = await supabase
    .from("quotes")
    .select(QUOTE_SELECT_NO_IMAGES)
    .eq("id", id)
    .single();
  if (fallbackError) throw fallbackError;
  return sortQuote(fallback);
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
    // No quote_item_images embed here (unlike the QUOTE_SELECT read path) —
    // a brand-new section's quote_items is always [] anyway, so there's
    // nothing to embed, and this keeps "Add section" safe to call even
    // before migration 0024 has run (an embed PostgREST can't resolve fails
    // the whole insert+select, not just that field).
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

/**
 * Deleting a section cascades its items and their images at the DB level,
 * but that cascade never touches the actual files in Storage — best-effort
 * clean those up first so they don't orphan. A failure here never blocks
 * the section delete itself; it just leaves the files (a minor storage-cost
 * issue, not a correctness one).
 */
export async function deleteQuoteSection(id: string): Promise<void> {
  try {
    const { data: items } = await supabase.from("quote_items").select("id").eq("section_id", id);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length) {
      const { data: images } = await supabase
        .from("quote_item_images")
        .select("storage_path")
        .in("quote_item_id", itemIds);
      if (images?.length) {
        await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
      }
    }
  } catch (err) {
    console.warn("Failed to clean up quote item images before deleting section:", err);
  }
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
    category_id?: string | null;
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
      category_id: input.category_id ?? null,
    })
    // No embed here — see addQuoteSection's comment just above. A brand-new
    // item has zero images by definition, so it's attached in JS instead of
    // requested from PostgREST (keeps "Add item" safe pre-migration too).
    .select()
    .single();
  if (error) throw error;
  return { ...data, quote_item_images: [] };
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
      | "category_id"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("quote_items").update(patch).eq("id", id);
  if (error) throw error;
}

/** See deleteQuoteSection's doc comment — same best-effort Storage cleanup
 * before the (cascading) DB delete. */
export async function deleteQuoteItem(id: string): Promise<void> {
  try {
    const { data: images } = await supabase
      .from("quote_item_images")
      .select("storage_path")
      .eq("quote_item_id", id);
    if (images?.length) {
      await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
    }
  } catch (err) {
    console.warn("Failed to clean up quote item images before deleting item:", err);
  }
  const { error } = await supabase.from("quote_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quote item images — photos attached to a quote line item (0024). Multiple
// per item. Like the rest of the Quote Builder, these are part of the local
// draft: a picked file is compressed and held as a blob (+ a local preview
// URL) in QuoteWorkspace's draft state, and only actually uploaded here when
// "Save changes" runs and a real quote_item_id exists — including for a
// brand-new, not-yet-saved line item, which gets one the moment it's
// created during that same save. Discarding the draft never touches
// Storage at all, so there's nothing to orphan.
// ---------------------------------------------------------------------------

/**
 * Uploads an already-compressed blob to Storage and records the row — in
 * that order, so a failed DB insert rolls back the (already-uploaded)
 * storage object rather than leaving an orphan. Takes a pre-compressed blob
 * (not a raw File) — the caller compresses once, at pick-time, so the local
 * preview shown while the quote is still a draft matches exactly what
 * eventually gets uploaded, and Save never redoes that work.
 */
export async function uploadQuoteItemImage(
  quoteItemId: string,
  blob: Blob,
  sortOrder = 0,
): Promise<QuoteItemImage> {
  const path = `quote-items/${quoteItemId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("quote_item_images")
    .insert({ quote_item_id: quoteItemId, storage_path: path, sort_order: sortOrder })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function deleteQuoteItemImage(
  image: Pick<QuoteItemImage, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .remove([image.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("quote_item_images").delete().eq("id", image.id);
  if (error) throw error;
}

/**
 * Resolves Storage paths (from the `images` bucket) to viewable, expiring
 * URLs — used for both quote-item and project images, and by the anon
 * client-facing shared-quote page (storage.objects RLS, not this function,
 * decides whether that succeeds — see 0023).
 */
export async function getSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(IMAGES_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) urls[row.path] = row.signedUrl;
  }
  return urls;
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
  expense_category_id?: string | null;
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
      expense_category_id: input.expense_category_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Expenses are otherwise create/delete-only — this exists just so a
 * mis-tagged or untagged expense can be recategorized without deleting and
 * re-adding it. */
export async function updateExpense(
  id: string,
  patch: Partial<Pick<Expense, "expense_category_id">>,
): Promise<void> {
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) throw error;
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

/** get_shared_quote returns raw storage_paths, not URLs — the share page
 * resolves them itself via getSignedImageUrls(), gated by the anon
 * storage.objects policy scoped to currently-shared quotes (0023). */
export interface SharedQuoteItemImage {
  id: string;
  storage_path: string;
}

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
  // Optional, not just possibly-empty: get_shared_quote only started
  // returning this key as of migration 0026 — a quote fetched before that
  // migration runs simply won't have it. Guard with `item.images ?? []`.
  images?: SharedQuoteItemImage[];
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
