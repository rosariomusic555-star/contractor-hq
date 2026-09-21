import { supabase } from "./supabase";
import { compressImageFile, randomImageFilename } from "./imageUpload";

/** Private Storage bucket (0023) holding both quote-item and project
 * photos, split by path prefix (`quote-items/…`, `projects/…`). */
const IMAGES_BUCKET = "images";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectStatus = "draft" | "quote_sent" | "approved" | "invoiced" | "paid";
export type QuoteStatus = "draft" | "sent" | "approved" | "declined";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type ClientStatus = "lead" | "active" | "past" | "inactive";
export type PreferredContactMethod = "phone" | "email" | "text";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  /** CRM fields (0048) — additive, all nullable/defaulted. A persisted
   * replacement for ClientsView's old client-side-only computed "kind". */
  status: ClientStatus;
  lead_source: string | null;
  preferred_contact_method: PreferredContactMethod | null;
  tags: string[];
  internal_notes: string | null;
  /** Freeform key/value store — no field-type system, just a flat object. */
  custom_fields: Record<string, string>;
  /** Client Hub (0063) — set when the contractor sends (or resends) an
   * invite, and when the client actually signs in. Neither is a foreign
   * key into any auth table; the portal session is matched to client rows
   * by email at read time (see get_portal_context() SQL), so these two
   * columns are purely for the contractor-facing "invited / active / never
   * signed in" status. */
  portal_invited_at: string | null;
  portal_last_sign_in_at: string | null;
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
  /** Legacy month-precision field (0053) — superseded by
   * scheduled_start_date/scheduled_end_date (0058) as of the Backlog
   * Schedule calendar. Nothing new reads or writes this; left in place
   * (never dropped) since old rows were backfilled from it. */
  target_install_month: string | null;
  /** Day-precision scheduling (0058) — the Backlog Schedule calendar's
   * source of truth. Both nullable: a start with no end renders as a
   * single-day bar; neither means the job sits in the Unscheduled rail. */
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  /** Estimated duration card (0061) — owner-entered estimate in working
   * (crew) days, plus the actual start/end dates measured against it once
   * the job runs. Deliberately separate from scheduled_start_date/
   * scheduled_end_date above: those are the planned window, these are
   * reality, and the two are allowed to disagree. */
  estimated_duration_days: number | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
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
  /** Set when an employee (0043) uploaded this photo from the field —
   * null for an owner upload. Same table/query either way, so these show
   * up in the owner's existing gallery automatically. */
  uploaded_by_employee_id: string | null;
  /** Client Hub (0064) — defaults hidden; the contractor opts a photo in
   * before it appears in the portal's Photos section. */
  client_visible: boolean;
  /** Client Hub Phase 5 (0067) — true only for a photo the CLIENT uploaded
   * from the portal (site conditions, a question, a problem they spotted).
   * `accepted` defaults true for every other upload path (owner/employee),
   * and false only for a fresh client upload — it never auto-publishes
   * into the main gallery grid until the contractor accepts it. */
  uploaded_by_client: boolean;
  accepted: boolean;
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
  signed_by: string | null;
  /** Client Hub (0065) — captured alongside signed_by/signed_at on portal
   * approval; null for a quote signed the old way (share-link sign_quote,
   * which never captured IP), and always null for a declined quote. */
  signed_ip: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  created_at: string;
  updated_at: string;
  // Which materials sheet (0042) this quote's Estimated Cost pulls its real
  // cost from. Only meaningful once a project has more than one quote or
  // more than one materials sheet — see QuoteWorkspace's estCost logic,
  // which otherwise falls back to the project's single (or only) sheet
  // automatically. Null on a standalone quote, and on a project-linked one
  // that hasn't been explicitly linked (or doesn't need to be).
  material_sheet_id: string | null;
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
/** Optional per-product specs (0034) — coverage/pallet, dimensions, joint
 * width, bag coverage. All optional, all generic across material_types
 * (not type-conditional fields). Not read by anything else in the app; a
 * plain, freeform spec sheet a contractor can fill in per Price Book
 * item. */
export interface PriceBookItemSpecs {
  coverage_per_pallet_sqft?: number;
  units_per_pallet?: number;
  length_in?: number;
  width_in?: number;
  thickness_in?: number;
  joint_width_in?: number;
  coverage_per_bag_sqft?: number;
}

export interface PriceBookItem {
  id: string;
  user_id: string;
  name: string;
  unit: string | null;
  unit_price: number;
  /** "Required" is enforced in the Settings form, not the DB — see 0027. */
  expense_category_id: string | null;
  /** Which role this product plays (e.g. "paver", "base_aggregate") — see
   * MATERIAL_TYPES below for the canonical list. Null = not tagged; the
   * item still works normally as a plain Materials Sheet / Price Book
   * entry. */
  material_type: string | null;
  specs: PriceBookItemSpecs;
  created_at: string;
}

export interface MaterialTypeOption {
  value: string;
  label: string;
}

/** Canonical list of material_type values a Price Book item can be tagged
 * with — free text in the DB (0034), not a CHECK-constrained enum, so this
 * list can grow without a migration. Single source of truth for the
 * Settings > Price Book dropdown. */
export const MATERIAL_TYPES: MaterialTypeOption[] = [
  { value: "paver", label: "Paver" },
  { value: "base_aggregate", label: "Base aggregate" },
  { value: "bedding_sand", label: "Bedding sand" },
  { value: "polymeric_sand", label: "Polymeric sand" },
  { value: "edge_restraint", label: "Edge restraint" },
];

export const materialTypeLabel = (value: string | null): string =>
  MATERIAL_TYPES.find((t) => t.value === value)?.label ?? value ?? "—";

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
  /** Set when this line was picked from the Product Catalog instead — a
   * line is ever linked to at most one of price_book_item_id /
   * catalog_product_id, never both. Unlike a Price Book pick, this does
   * NOT lock expense_category_id (the catalog carries no cost-category
   * concept of its own). */
  catalog_product_id: string | null;
  /** Reference-only, every line regardless of source — not part of the
   * quantity*unit_cost math. */
  waste_percent: number;
}

export interface MaterialsSection {
  id: string;
  // Denormalized whole-project key (0003) — unchanged meaning, still what
  // listMaterials(projectId) filters on for project-level aggregate totals.
  project_id: string;
  // Which materials sheet (0042) this section actually belongs to — the
  // per-sheet grouping key the sheet builder (listMaterialsBySheet) filters
  // on. A project can have more than one sheet; every section belongs to
  // exactly one.
  sheet_id: string;
  name: string;
  sort_order: number;
  /** Set when this section was created via "Create Smart Section" — which
   * build type template (src/lib/smartSections/) it is, so its header can
   * show a calculator icon that knows which question set to run. Null for
   * an ordinary manually-created section. Set once at creation; renaming
   * the section afterward doesn't clear it. */
  smart_section_build_type: string | null;
  materials_items: MaterialsItem[];
}

/**
 * A named, separate materials document within a project (0042). Most
 * projects have exactly one — created transparently the first time a
 * section is saved, with no visible "sheet" chrome — but a project's scope
 * can grow mid-way (a genuinely separate added feature, not a change order
 * folded into existing scope) and need its own sheet, usually paired with
 * its own quote. See linkQuoteToMaterialSheet() for how a quote picks up a
 * specific sheet's cost once a project has more than one of either.
 */
export interface MaterialsSheet {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  // Only populated where the select asks for it (the global Material
  // Sheets list) — project-scoped callers already know their own project.
  project?: ProjectRef | null;
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
  // Only populated where the select asks for it (the global Expenses
  // list) — project-scoped callers already know their own project.
  project?: ProjectRef | null;
}

export type ChangeOrderStatus = "pending" | "approved" | "rejected";
export type ChangeOrderReason =
  | "client_request"
  | "site_condition"
  | "code_requirement"
  | "design_change"
  | "other";

export const CHANGE_ORDER_REASONS: { value: ChangeOrderReason; label: string }[] = [
  { value: "client_request", label: "Client request" },
  { value: "site_condition", label: "Site condition" },
  { value: "code_requirement", label: "Code requirement" },
  { value: "design_change", label: "Design change" },
  { value: "other", label: "Other" },
];

/** A documented, approved-or-not adjustment to a project's contract value,
 * made after the original quote was accepted. project_id is required —
 * unlike quotes/invoices, a change order can never stand alone. `amount` is
 * signed: change orders can increase OR decrease the contract. Only
 * `status: "approved"` change orders count toward projectContractValue() —
 * pending/rejected ones never move any number (see below). */
export interface ChangeOrder {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string | null;
  reason: ChangeOrderReason | null;
  amount: number;
  status: ChangeOrderStatus;
  approved_at: string | null;
  /** Client Hub (0065) — a client-side approval/decline now captures a
   * signature name (and IP), same as a quote's signed_by/signed_ip; both
   * stay null for a contractor-side one-tap approval, which still works
   * exactly as before. */
  approved_by: string | null;
  approved_ip: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  created_at: string;
}

/** A photo attached to a change order (0031) — e.g. documenting the site
 * condition or added scope that justified it. `storage_path` is a path
 * into the `images` Storage bucket (0023) — resolve to a viewable URL with
 * getSignedImageUrls(). No caption field (unlike project images) — kept
 * intentionally simple. */
export interface ChangeOrderImage {
  id: string;
  change_order_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Derived amounts
// ---------------------------------------------------------------------------

/** Whether a line item has actually been committed to — required items
 * always; an optional section/item only once the client has checked it on
 * the live page. This is narrower than "counts toward the quote total"
 * (see quoteTotal() below) — it's for deciding what to actually bill for
 * (InvoiceWorkspace's line-item picker) or count as recognized revenue
 * (metrics.ts revenueByCategory), where speculative optional work nobody
 * picked must never be included. */
export function quoteItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  if (section.is_optional || item.is_optional) return item.client_selected;
  return true;
}

/** Line total = quantity × unit price. Quantity defaults to 1 (pre-0014 rows). */
export function quoteLineTotal(item: { price: number; quantity?: number | null }): number {
  return Number(item.price) * (item.quantity == null ? 1 : Number(item.quantity));
}

/** Quote total = every line item, required or optional (quotes have no
 * stored amount) — the quote's full all-in value, the same number shown
 * everywhere a quote's total appears (the Quote builder's headline, quote
 * list, project rollups/contract value, dashboard, backlog). This is
 * deliberately NOT gated by quoteItemIncluded()/client_selected — that's a
 * narrower "what's actually committed" concept used only for invoicing and
 * revenue recognition (see quoteItemIncluded's own doc comment), which
 * would otherwise never reach a quote's full total for an unselected
 * optional quote and so never register as fully paid. */
export function quoteTotal(sections: QuoteSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.quote_items ?? []) {
      total += quoteLineTotal(item);
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

/** Sum of a project's APPROVED change orders only — pending/rejected never
 * count. This is the only place that filters by status; every caller of
 * projectContractValue() below gets that rule for free. */
export function approvedChangeOrderTotal(changeOrders: ChangeOrder[]): number {
  return changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + Number(co.amount), 0);
}

/**
 * A project's contract value = its headline quote's total, plus its
 * approved change orders. This is the single source of truth for
 * "contract value" — nothing stores it; every screen that shows a
 * project's contract (ProjectDetailView, ProjectsView, invoicing) derives
 * it live from this same function so there's never a second number to
 * drift out of sync.
 */
export function projectContractValue(quotes: Quote[], changeOrders: ChangeOrder[]): number {
  const headline = pickHeadlineQuote(quotes);
  const base = headline ? quoteTotal(headline.quote_sections) : 0;
  return base + approvedChangeOrderTotal(changeOrders);
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

/** A customer's realized revenue — paid invoices only (0048), same
 * revenue-recognition rule as everywhere else in the app that talks
 * about real money received. */
export function clientLifetimeRevenue(invoices: Invoice[]): number {
  return invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount), 0);
}

/** What a customer still owes — sent/overdue invoices; a draft invoice
 * hasn't been issued to them yet, so it isn't a real obligation. */
export function clientOutstandingBalance(invoices: Invoice[]): number {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + Number(i.amount), 0);
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
  lead_source?: string | null;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      lead_source: input.lead_source || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClient(
  id: string,
  patch: Partial<
    Pick<
      Client,
      | "name"
      | "email"
      | "phone"
      | "address"
      | "status"
      | "lead_source"
      | "preferred_contact_method"
      | "tags"
      | "internal_notes"
      | "custom_fields"
      | "portal_invited_at"
    >
  >,
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

/** A customer's own projects (0048, Customer 360 page) — distinct from
 * listProjects()'s full-list use everywhere else. */
export async function listProjectsForClient(clientId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  patch: Partial<
    Pick<
      Project,
      | "name"
      | "client_id"
      | "status"
      | "target_install_month"
      | "scheduled_start_date"
      | "scheduled_end_date"
      | "estimated_duration_days"
      | "actual_start_date"
      | "actual_end_date"
    >
  >,
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
// Business profile (0055) — one row per user, same shape as QuoteDefaults.
// Backs Settings > Business profile (previously 100% decorative) and is the
// address the Dashboard Weather Strip geocodes.
// ---------------------------------------------------------------------------

export interface BusinessProfile {
  company_name: string | null;
  phone: string | null;
  email: string | null;
  license: string | null;
  address: string | null;
  /** Client Hub (0064) — shown as the portal's own header branding, since
   * to a client the hub reads as the contractor's portal, not
   * ContractorHQ's. A path into the `images` bucket under
   * business-logos/{user_id}/..., resolved via getSignedImageUrls(). */
  logo_url: string | null;
  /** "07:00"/"17:00" (0068) — the crew's work window, used to scope the
   * Dashboard Weather Strip's rain-risk % to hours someone's actually
   * outside rather than the full 24h day. */
  crew_start_time: string;
  crew_end_time: string;
}

export const BUSINESS_PROFILE_FALLBACK: BusinessProfile = {
  company_name: null,
  phone: null,
  email: null,
  license: null,
  address: null,
  logo_url: null,
  crew_start_time: "07:00",
  crew_end_time: "17:00",
};

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const { data, error } = await supabase.from("business_profile").select("*").maybeSingle();
  if (error) {
    // PGRST205 = migration 0055 hasn't been run yet — degrade to the fallback
    // instead of breaking Settings or the Dashboard.
    if (error.code === "PGRST205") return BUSINESS_PROFILE_FALLBACK;
    throw error;
  }
  if (!data) return BUSINESS_PROFILE_FALLBACK;
  return {
    company_name: data.company_name ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    license: data.license ?? null,
    address: data.address ?? null,
    logo_url: data.logo_url ?? null,
    crew_start_time: data.crew_start_time ?? BUSINESS_PROFILE_FALLBACK.crew_start_time,
    crew_end_time: data.crew_end_time ?? BUSINESS_PROFILE_FALLBACK.crew_end_time,
  };
}

export async function saveBusinessProfile(patch: Partial<BusinessProfile>): Promise<BusinessProfile> {
  const merged = { ...(await getBusinessProfile()), ...patch };
  const { data, error } = await supabase
    .from("business_profile")
    .upsert({
      company_name: merged.company_name,
      phone: merged.phone,
      email: merged.email,
      license: merged.license,
      address: merged.address,
      logo_url: merged.logo_url,
      crew_start_time: merged.crew_start_time,
      crew_end_time: merged.crew_end_time,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    company_name: data.company_name ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    license: data.license ?? null,
    address: data.address ?? null,
    logo_url: data.logo_url ?? null,
    crew_start_time: data.crew_start_time ?? BUSINESS_PROFILE_FALLBACK.crew_start_time,
    crew_end_time: data.crew_end_time ?? BUSINESS_PROFILE_FALLBACK.crew_end_time,
  };
}

/** Uploads a new logo (replacing any previous one — old object is
 * best-effort removed), returns the storage path to save as
 * business_profile.logo_url. */
export async function uploadBusinessLogo(userId: string, file: File): Promise<string> {
  const compressed = await compressImageFile(file, { maxDimension: 512, quality: 0.9 });
  const path = `business-logos/${userId}/${randomImageFilename(file.name)}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

// ---------------------------------------------------------------------------
// Backlog settings (0054) — one row per user, same shape as QuoteDefaults.
// Backs Settings > Seasonal capacity and the Dashboard Seasonal Backlog card.
// ---------------------------------------------------------------------------

export type BacklogRangeMonths = 6 | 12;
export type BacklogCalendarView = "month" | "quarter" | "timeline";

export interface BacklogSettings {
  capacity_dollars_per_month: number;
  /** Last-selected range on the Dashboard Seasonal Backlog card (0057) —
   * persisted so it doesn't reset to 6 months on every load. */
  default_range_months: BacklogRangeMonths;
  /** Legacy (0058) — the Backlog Schedule page was briefly Month/Quarter/
   * Timeline before simplifying to Month-only; the view switcher is gone,
   * so nothing writes this anymore. Column kept (never dropped) rather
   * than backed out. */
  default_calendar_view: BacklogCalendarView;
}

export const BACKLOG_SETTINGS_FALLBACK: BacklogSettings = {
  capacity_dollars_per_month: 50000,
  default_range_months: 6,
  default_calendar_view: "month",
};

export async function getBacklogSettings(): Promise<BacklogSettings> {
  const { data, error } = await supabase.from("backlog_settings").select("*").maybeSingle();
  if (error) {
    // PGRST205 = migration 0054 hasn't been run yet — degrade to the fallback
    // instead of breaking the Dashboard.
    if (error.code === "PGRST205") return BACKLOG_SETTINGS_FALLBACK;
    throw error;
  }
  if (!data) return BACKLOG_SETTINGS_FALLBACK;
  return {
    capacity_dollars_per_month: Number(data.capacity_dollars_per_month),
    // Columns added in 0057/0058 — degrade to the default on a not-yet-migrated row.
    default_range_months: (data.default_range_months as BacklogRangeMonths | undefined) ?? 6,
    default_calendar_view: (data.default_calendar_view as BacklogCalendarView | undefined) ?? "month",
  };
}

export async function saveBacklogSettings(patch: Partial<BacklogSettings>): Promise<BacklogSettings> {
  const merged = { ...(await getBacklogSettings()), ...patch };
  const { data, error } = await supabase
    .from("backlog_settings")
    .upsert({
      capacity_dollars_per_month: merged.capacity_dollars_per_month,
      default_range_months: merged.default_range_months,
      default_calendar_view: merged.default_calendar_view,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    capacity_dollars_per_month: Number(data.capacity_dollars_per_month),
    default_range_months: (data.default_range_months as BacklogRangeMonths | undefined) ?? 6,
    default_calendar_view: (data.default_calendar_view as BacklogCalendarView | undefined) ?? "month",
  };
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
 * uploadQuoteItemImage. `uploadedByEmployeeId` (0043) is set when an
 * employee is the one uploading from the field — omit for an owner
 * upload. Either way this is the same table the owner's Project Images
 * gallery already reads, so an employee's photos show up there for free. */
export async function addProjectImage(
  projectId: string,
  file: File,
  input: { caption?: string | null; sort_order?: number; uploadedByEmployeeId?: string | null } = {},
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
      uploaded_by_employee_id: input.uploadedByEmployeeId ?? null,
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

/** Client Hub (0064) visibility toggle — one photo, or (bulk "share with
 * client") several at once. */
export async function setProjectImagesClientVisible(ids: string[], visible: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("project_images").update({ client_visible: visible }).in("id", ids);
  if (error) throw error;
}

/** Accepts a client-submitted photo (Client Hub Phase 5) into the regular
 * gallery — it still starts hidden from the client (client_visible stays
 * false, same as any other photo) until the contractor explicitly shares
 * it back via setProjectImagesClientVisible(). */
export async function acceptProjectImage(id: string): Promise<void> {
  const { error } = await supabase.from("project_images").update({ accepted: true }).eq("id", id);
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
// Project messages (Client Hub Phase 5, 0067) — the per-project thread
// between contractor and client. Deliberately its own table, not the
// `activities` log (that's a flat one-off log, not a two-way thread) — but
// every message still writes a matching activities row (see
// portal_send_message's SQL for the client→contractor direction; this
// file's sendProjectMessage does the same for contractor→client) so it
// surfaces on the EXISTING Communications page and a client's own Activity
// card, per the "don't build a second inbox" instruction.
// ---------------------------------------------------------------------------

export interface ProjectMessage {
  id: string;
  project_id: string;
  user_id: string;
  sender: "contractor" | "client";
  body: string | null;
  image_paths: string[];
  created_at: string;
}

export async function listProjectMessages(projectId: string): Promise<ProjectMessage[]> {
  const { data, error } = await supabase
    .from("project_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function sendProjectMessage(
  projectId: string,
  clientId: string | null,
  body: string,
  files: File[],
): Promise<void> {
  const imagePaths: string[] = [];
  for (const file of files) {
    const compressed = await compressImageFile(file);
    const path = `project-messages/${projectId}/${randomImageFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGES_BUCKET)
      .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
    imagePaths.push(path);
  }

  const { error } = await supabase.from("project_messages").insert({
    project_id: projectId,
    sender: "contractor",
    body: body.trim() || null,
    image_paths: imagePaths,
  });
  if (error) throw error;

  if (clientId) {
    await logActivity(clientId, "text", `Message to client: ${(body.trim() || "(photo)").slice(0, 140)}`, {
      project_id: projectId,
    });
  }
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
  material_type?: string | null;
  specs?: PriceBookItemSpecs;
}): Promise<PriceBookItem> {
  const { data, error } = await supabase
    .from("price_book")
    .insert({
      name: input.name,
      unit: input.unit ?? null,
      unit_price: input.unit_price,
      expense_category_id: input.expense_category_id,
      material_type: input.material_type ?? null,
      specs: input.specs ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePriceBookItem(
  id: string,
  patch: Partial<
    Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id" | "material_type" | "specs">
  >,
): Promise<void> {
  const { error } = await supabase.from("price_book").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePriceBookItem(id: string): Promise<void> {
  const { error } = await supabase.from("price_book").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Product Catalog (0036) — a global, curated library of real manufacturer
// products, maintained by hand (migrations/SQL editor) rather than through
// the app. Read-only from here: there are deliberately no create/update/
// delete functions for it. Completely separate from Price Book — a
// Materials Sheet line links to at most one of price_book_item_id /
// catalog_product_id, never both.
// ---------------------------------------------------------------------------

export interface ProductCatalogSpecs {
  /** Coverage (e.g. sq ft) one single piece/unit provides. */
  coverage_per_unit?: number;
  /** How many pieces/units come in one orderable package (pallet, bag, box…). */
  units_per_package?: number;
  [key: string]: unknown;
}

export interface ProductCatalogItem {
  id: string;
  manufacturer: string;
  category: string;
  name: string;
  sku: string | null;
  unit: string | null;
  specs: ProductCatalogSpecs;
  created_at: string;
  updated_at: string;
}

/** Small, global, read-mostly dataset — fetched in full, same convention
 * as listPriceBookItems()/listExpenseCategories(). */
export async function listProductCatalog(): Promise<ProductCatalogItem[]> {
  const { data, error } = await supabase
    .from("product_catalog")
    .select("*")
    .order("manufacturer")
    .order("category")
    .order("name");
  if (error) {
    // PGRST205 = migration 0036 hasn't been run yet — degrade to empty
    // instead of breaking the Materials Sheet picker.
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export interface CatalogPriceOverride {
  user_id: string;
  catalog_product_id: string;
  price: number;
  updated_at: string;
}

export async function listCatalogPriceOverrides(): Promise<CatalogPriceOverride[]> {
  const { data, error } = await supabase.from("catalog_price_overrides").select("*");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({ ...r, price: Number(r.price) }));
}

/** "Remember this price for next time" — one row per (user, catalog
 * product), upserted on the composite primary key. */
export async function upsertCatalogPriceOverride(catalogProductId: string, price: number): Promise<void> {
  const { error } = await supabase
    .from("catalog_price_overrides")
    .upsert({ catalog_product_id: catalogProductId, price }, { onConflict: "user_id,catalog_product_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Materials sheets (0042) — a project can have more than one, each a
// separate named document (its own sections/items) for when scope grows
// mid-project. listMaterials(projectId) is the whole-project aggregate
// (every sheet's sections combined) — used for project-level totals
// (ProjectDetailView) and, since it's equal to "that one sheet" whenever a
// project has at most one, as the implicit-pairing shortcut in
// QuoteWorkspace. listMaterialsBySheet(sheetId) scopes to a single sheet —
// used by the sheet builder and by a quote once explicitly linked to one.
// ---------------------------------------------------------------------------

/** Omitting projectId returns every materials sheet the user owns, across
 * all projects — used by the global Material Sheets list. */
export async function listMaterialsSheets(projectId?: string): Promise<MaterialsSheet[]> {
  let query = supabase
    .from("materials_sheets")
    .select("*, project:projects(name)")
    .order("created_at");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) {
    // PGRST205 = migration 0042 hasn't been run yet — degrade to empty,
    // same convention as every other not-yet-migrated table in this file.
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** Every materials section (with its items) the user owns, across all
 * projects/sheets — RLS-scoped, same unfiltered-list convention as
 * listQuotes()/listInvoices(). Used by the global Material Sheets list to
 * compute each sheet's cost via materialsCogs() without an N+1 per-sheet
 * fetch; group by sheet_id client-side. */
/** The top-level `.order("sort_order")` only orders the sections
 * themselves — PostgREST doesn't guarantee a nested embed's (materials_items
 * here) row order, so each section's own items need their own client-side
 * sort. Mirrors sortQuote() below for quote_sections/quote_items. */
function sortMaterialsSections(sections: MaterialsSection[]): MaterialsSection[] {
  for (const s of sections) s.materials_items?.sort((a, b) => a.sort_order - b.sort_order);
  return sections;
}

export async function listAllMaterialsSections(): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select("*, materials_items(*)")
    .order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return sortMaterialsSections(data ?? []);
}

export async function createMaterialsSheet(
  projectId: string,
  input: { name?: string; sort_order?: number } = {},
): Promise<MaterialsSheet> {
  const { data, error } = await supabase
    .from("materials_sheets")
    .insert({
      project_id: projectId,
      name: input.name?.trim() || "Materials sheet",
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialsSheet(
  id: string,
  patch: Partial<Pick<MaterialsSheet, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("materials_sheets").update(patch).eq("id", id);
  if (error) throw error;
}

/** Cascades its own sections/items at the DB level. Any quote linked to it
 * has its material_sheet_id cleared automatically (ON DELETE SET NULL) —
 * that quote's Estimated Cost reverts to "Not available" on its own next
 * read, no app-level cleanup needed here. */
export async function deleteMaterialsSheet(id: string): Promise<void> {
  const { error } = await supabase.from("materials_sheets").delete().eq("id", id);
  if (error) throw error;
}

export async function listMaterials(projectId: string): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select("*, materials_items(*)")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return sortMaterialsSections(data ?? []);
}

export async function listMaterialsBySheet(sheetId: string): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select("*, materials_items(*)")
    .eq("sheet_id", sheetId)
    .order("sort_order");
  if (error) throw error;
  return sortMaterialsSections(data ?? []);
}

export async function createMaterialsSection(
  projectId: string,
  sheetId: string,
  input: { name: string; sort_order?: number; smart_section_build_type?: string | null },
): Promise<MaterialsSection> {
  const { data, error } = await supabase
    .from("materials_sections")
    .insert({
      project_id: projectId,
      sheet_id: sheetId,
      name: input.name,
      sort_order: input.sort_order ?? 0,
      smart_section_build_type: input.smart_section_build_type ?? null,
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
    catalog_product_id?: string | null;
    waste_percent?: number;
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
      catalog_product_id: input.catalog_product_id ?? null,
      waste_percent: input.waste_percent ?? 0,
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
      | "catalog_product_id"
      | "waste_percent"
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
// Smart Section settings (0040) — a contractor's own customization of a
// build type's step-1 line items and step-2 calculator numbers. Every
// build type ships with app-standard defaults (src/lib/smartSections/) so
// it works with zero setup; a row here overrides either or both for that
// contractor only. Missing row, or a missing key within line_items/
// tunables, falls back to the app default — see resolveEffectiveLineItems/
// resolveTunableValue in src/lib/smartSections/index.ts.
// ---------------------------------------------------------------------------

/** One line item slot as stored in a contractor's customization —
 * slot_key ties it back to a known calculator material (null = a pure
 * custom addition the calculator will never compute a quantity for).
 * Order in the array is display order. */
export interface SmartSectionLineItemSetting {
  slot_key: string | null;
  name: string;
}

export interface SmartSectionSettings {
  build_type: string;
  line_items: SmartSectionLineItemSetting[] | null;
  tunables: Record<string, number>;
}

export async function listSmartSectionSettings(): Promise<SmartSectionSettings[]> {
  const { data, error } = await supabase
    .from("smart_section_settings")
    .select("build_type, line_items, tunables");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    build_type: r.build_type,
    line_items: r.line_items ?? null,
    tunables: r.tunables ?? {},
  }));
}

export async function saveSmartSectionSettings(
  buildType: string,
  patch: { line_items?: SmartSectionLineItemSetting[]; tunables?: Record<string, number> },
): Promise<void> {
  const { error } = await supabase
    .from("smart_section_settings")
    .upsert({ build_type: buildType, ...patch }, { onConflict: "user_id,build_type" });
  if (error) throw error;
}

/** "Reset to default" — deletes the override row entirely so both line
 * items and calculator numbers fall back to the app's shipped defaults. */
export async function resetSmartSectionSettings(buildType: string): Promise<void> {
  const { error } = await supabase.from("smart_section_settings").delete().eq("build_type", buildType);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quick Quote rates (0041) — a contractor's own default $ rate per build
// type, used to price a Quick Quote's single lump-sum line item
// (rate x quantity). Separate from smart_section_settings — same build-type
// taxonomy, no shared data. Every build type ships a standard default rate
// (src/lib/quickQuote/) so it works with zero setup; a missing row here
// just means "use the app default."
// ---------------------------------------------------------------------------

export interface QuickQuoteRate {
  build_type: string;
  rate: number;
}

export async function listQuickQuoteRates(): Promise<QuickQuoteRate[]> {
  const { data, error } = await supabase.from("quick_quote_rates").select("build_type, rate");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({ build_type: r.build_type, rate: Number(r.rate) }));
}

export async function saveQuickQuoteRate(buildType: string, rate: number): Promise<void> {
  const { error } = await supabase
    .from("quick_quote_rates")
    .upsert({ build_type: buildType, rate }, { onConflict: "user_id,build_type" });
  if (error) throw error;
}

export async function resetQuickQuoteRate(buildType: string): Promise<void> {
  const { error } = await supabase.from("quick_quote_rates").delete().eq("build_type", buildType);
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

/**
 * Every quote belonging to a customer (0048, Customer 360 page) — a
 * quote can reach a client two ways: directly (`client_id` set, the
 * standalone/override case) or through its project (`project_id` in one
 * of this client's projects) — quotes on a project usually leave
 * `client_id` null and rely on the project's own client, per Quote's own
 * doc comment, so both paths have to be checked.
 */
export async function listQuotesForClient(clientId: string): Promise<Quote[]> {
  const projects = await listProjectsForClient(clientId);
  const orParts = [`client_id.eq.${clientId}`];
  if (projects.length) orParts.push(`project_id.in.(${projects.map((p) => p.id).join(",")})`);

  const build = (select: string) =>
    supabase.from("quotes").select(select).or(orParts.join(",")).order("updated_at", { ascending: false });
  const { data, error } = await build(QUOTE_SELECT);
  if (!error) return (data ?? []).map(sortQuote);
  if (!isMissingRelationshipError(error)) throw error;
  const { data: fallback, error: fallbackError } = await build(QUOTE_SELECT_NO_IMAGES);
  if (fallbackError) throw fallbackError;
  return (fallback ?? []).map(sortQuote);
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
    Pick<
      Quote,
      | "status"
      | "deposit_percentage"
      | "notes"
      | "terms"
      | "client_id"
      | "project_id"
      | "signed_at"
      | "signed_by"
      | "material_sheet_id"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Sets (or clears, with sheetId null) which materials sheet a quote's
 * Estimated Cost pulls from. One-to-one, enforced by a partial unique index
 * on quotes.material_sheet_id (0042): linking steals the sheet away from
 * whichever other quote currently holds it, so the same function works
 * from either direction — the quote builder's own "Link materials sheet"
 * picker, and the materials sheet builder's "Link quote" picker — since
 * both end up as the same single-column write on the quote being linked.
 */
export async function linkQuoteToMaterialSheet(quoteId: string, sheetId: string | null): Promise<void> {
  if (sheetId) {
    const { error: stealError } = await supabase
      .from("quotes")
      .update({ material_sheet_id: null })
      .eq("material_sheet_id", sheetId)
      .neq("id", quoteId);
    if (stealError) throw stealError;
  }
  const { error } = await supabase.from("quotes").update({ material_sheet_id: sheetId }).eq("id", quoteId);
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

/** Every invoice belonging to a customer (0048, Customer 360 page) — an
 * invoice has no client_id column at all (see the Invoice type's own
 * doc comment), so this is only ever reachable through the client's
 * projects. A client with no projects yet simply has none. */
export async function listInvoicesForClient(clientId: string): Promise<Invoice[]> {
  const projects = await listProjectsForClient(clientId);
  if (projects.length === 0) return [];
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .in(
      "project_id",
      projects.map((p) => p.id),
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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

/** Omitting projectId returns every expense the user owns, across all
 * projects — used by the global Expenses list. */
export async function listExpenses(projectId?: string): Promise<Expense[]> {
  let query = supabase
    .from("expenses")
    .select("*, project:projects(name)")
    .order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
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
// Change orders (0031) — see projectContractValue() above for how these
// feed into a project's contract value.
// ---------------------------------------------------------------------------

/** Omitting projectId returns every change order the user owns, across all
 * projects — used by ProjectsView to fold approved totals into its bulk
 * per-project contract Map. */
export async function listChangeOrders(projectId?: string): Promise<ChangeOrder[]> {
  let query = supabase.from("change_orders").select("*").order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Always created as "pending" — status only ever changes via updateChangeOrder(). */
export async function createChangeOrder(input: {
  project_id: string;
  title: string;
  description?: string | null;
  reason?: ChangeOrderReason | null;
  amount: number;
}): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from("change_orders")
    .insert({
      project_id: input.project_id,
      title: input.title,
      description: input.description ?? null,
      reason: input.reason ?? null,
      amount: input.amount,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChangeOrder(
  id: string,
  patch: Partial<Pick<ChangeOrder, "title" | "description" | "reason" | "amount" | "status" | "approved_at">>,
): Promise<void> {
  const { error } = await supabase.from("change_orders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChangeOrder(id: string): Promise<void> {
  const { error } = await supabase.from("change_orders").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Suppliers (0062) — a contractor's own list of yards/distributors they buy
// from, for the Supplier combobox on Material orders. Deliberately separate
// from Product Catalog manufacturers (Techo-Bloc, Belgard…) — a supplier is
// who you buy from, not who makes the product. `material_orders.supplier`
// stays a plain denormalized text column (see below): this table is purely
// the dropdown's source of truth + contact info + most-recently-used
// ordering, not a foreign key material_orders points at, so deleting a
// supplier here never touches existing delivery records.
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  last_used_at: string | null;
  created_at: string;
}

/** Most-recently-used first, then alphabetical — the supplier ordered from
 * every week sits at the top. */
export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createSupplier(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: input.name.trim(),
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
    })
    .select()
    .single();
  if (error) {
    // Someone already saved this exact name (e.g. typed on another device,
    // or picked the same "Create" option twice in a race) — treat it as a
    // successful pick of the existing row rather than an error.
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("name", input.name.trim())
        .single();
      if (!fetchError && existing) return existing;
    }
    throw error;
  }
  return data;
}

export async function updateSupplier(
  id: string,
  patch: Partial<Pick<Supplier, "name" | "phone" | "email" | "address">>,
): Promise<void> {
  const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
  if (error) throw error;
}

/** Deleting a supplier here never touches material_orders — `supplier` is
 * denormalized text there, not a foreign key, so existing deliveries keep
 * the name they were saved with. */
export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw error;
}

/** Best-effort — bumps last_used_at so this supplier rises to the top of
 * the combobox next time. Called whenever a material order is saved with a
 * supplier name; failing silently (e.g. before migration 0062 is live, or
 * a name that was renamed/deleted since) is fine, it just means the MRU
 * ordering doesn't update this once. */
export async function touchSupplierUsage(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    await supabase.from("suppliers").update({ last_used_at: new Date().toISOString() }).eq("name", trimmed);
  } catch {
    // best-effort, see doc comment above
  }
}

// ---------------------------------------------------------------------------
// Material orders (0056) — supplier orders/deliveries per project. Same
// parent (order) + child (line items) shape as change orders above.
// ---------------------------------------------------------------------------

export type MaterialOrderStatus = "ordered" | "delivered" | "delayed";
export type MaterialOrderUnit = "pallet" | "ton" | "cubic_yard" | "bag" | "linear_foot" | "each";

export const MATERIAL_ORDER_UNITS: { value: MaterialOrderUnit; label: string; plural: string }[] = [
  { value: "pallet", label: "Pallet", plural: "pallets" },
  { value: "ton", label: "Ton", plural: "tons" },
  { value: "cubic_yard", label: "Cubic yard", plural: "cubic yards" },
  { value: "bag", label: "Bag", plural: "bags" },
  { value: "linear_foot", label: "Linear foot", plural: "linear feet" },
  { value: "each", label: "Each", plural: "each" },
];

export const materialOrderUnitLabel = (unit: MaterialOrderUnit, quantity: number): string =>
  MATERIAL_ORDER_UNITS.find((u) => u.value === unit)?.[quantity === 1 ? "label" : "plural"] ?? unit;

export interface MaterialOrderItem {
  id: string;
  material_order_id: string;
  description: string;
  quantity: number;
  unit: MaterialOrderUnit;
  sort_order: number;
}

export interface MaterialOrder {
  id: string;
  project_id: string;
  user_id: string;
  supplier: string | null;
  expected_delivery_date: string | null;
  status: MaterialOrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  material_order_items: MaterialOrderItem[];
  project?: ProjectRef | null;
}

const MATERIAL_ORDER_SELECT = "*, material_order_items(*), project:projects(name)";

/** Omitting projectId returns every material order the user owns, across
 * all projects — used by the Dashboard deliveries card. */
export async function listMaterialOrders(projectId?: string): Promise<MaterialOrder[]> {
  let query = supabase
    .from("material_orders")
    .select(MATERIAL_ORDER_SELECT)
    .order("expected_delivery_date", { ascending: true, nullsFirst: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createMaterialOrder(input: {
  project_id: string;
  supplier?: string | null;
  expected_delivery_date?: string | null;
  status?: MaterialOrderStatus;
  notes?: string | null;
  items: { description: string; quantity: number; unit: MaterialOrderUnit }[];
}): Promise<MaterialOrder> {
  const { data: order, error } = await supabase
    .from("material_orders")
    .insert({
      project_id: input.project_id,
      supplier: input.supplier ?? null,
      expected_delivery_date: input.expected_delivery_date ?? null,
      status: input.status ?? "ordered",
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("material_order_items").insert(
      input.items.map((item, i) => ({
        material_order_id: order.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        sort_order: i,
      })),
    );
    if (itemsError) throw itemsError;
  }

  const { data, error: refetchError } = await supabase
    .from("material_orders")
    .select(MATERIAL_ORDER_SELECT)
    .eq("id", order.id)
    .single();
  if (refetchError) throw refetchError;
  return data;
}

export async function updateMaterialOrder(
  id: string,
  patch: Partial<Pick<MaterialOrder, "supplier" | "expected_delivery_date" | "status" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("material_orders").update(patch).eq("id", id);
  if (error) throw error;
}

/** Best-effort cleans up this order's own photos in Storage before the
 * (cascading) delete — same reasoning as deleteProject's own cleanup. */
export async function deleteMaterialOrder(id: string): Promise<void> {
  try {
    const { data: images } = await supabase
      .from("material_order_images")
      .select("storage_path")
      .eq("material_order_id", id);
    if (images?.length) {
      await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
    }
  } catch (err) {
    console.warn("Failed to clean up material order images before deleting order:", err);
  }
  const { error } = await supabase.from("material_orders").delete().eq("id", id);
  if (error) throw error;
}

export async function addMaterialOrderItem(
  materialOrderId: string,
  input: { description: string; quantity: number; unit: MaterialOrderUnit; sort_order?: number },
): Promise<MaterialOrderItem> {
  const { data, error } = await supabase
    .from("material_order_items")
    .insert({
      material_order_id: materialOrderId,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialOrderItem(
  id: string,
  patch: Partial<Pick<MaterialOrderItem, "description" | "quantity" | "unit" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("material_order_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterialOrderItem(id: string): Promise<void> {
  const { error } = await supabase.from("material_order_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Material order (delivery) photos (0059) — same shape as project_images,
// so PhotoGallery (src/components/common/PhotoGallery.tsx) can treat a
// delivery's photos identically to a project's: proof of delivery, a
// damaged pallet, a packing slip.
// ---------------------------------------------------------------------------

export interface MaterialOrderImage {
  id: string;
  material_order_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export async function listMaterialOrderImages(materialOrderId: string): Promise<MaterialOrderImage[]> {
  const { data, error } = await supabase
    .from("material_order_images")
    .select("*")
    .eq("material_order_id", materialOrderId)
    .order("sort_order");
  if (error) {
    // PGRST205 = migration 0059 hasn't been run yet — degrade to empty
    // instead of breaking the delivery card, same as listProjectImages().
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** Compresses, uploads, and records the row — same order/rollback as
 * addProjectImage. */
export async function addMaterialOrderImage(
  materialOrderId: string,
  file: File,
  input: { caption?: string | null; sort_order?: number } = {},
): Promise<MaterialOrderImage> {
  const compressed = await compressImageFile(file);
  const path = `material-orders/${materialOrderId}/${randomImageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("material_order_images")
    .insert({
      material_order_id: materialOrderId,
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

export async function updateMaterialOrderImageCaption(id: string, caption: string | null): Promise<void> {
  const { error } = await supabase.from("material_order_images").update({ caption }).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterialOrderImage(
  image: Pick<MaterialOrderImage, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .remove([image.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("material_order_images").delete().eq("id", image.id);
  if (error) throw error;
}

export async function listChangeOrderImages(changeOrderId: string): Promise<ChangeOrderImage[]> {
  const { data, error } = await supabase
    .from("change_order_images")
    .select("*")
    .eq("change_order_id", changeOrderId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Compresses, uploads, and records the row — same order/rollback as addProjectImage. */
export async function addChangeOrderImage(
  changeOrderId: string,
  file: File,
  input: { sort_order?: number } = {},
): Promise<ChangeOrderImage> {
  const compressed = await compressImageFile(file);
  const path = `change-orders/${changeOrderId}/${randomImageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("change_order_images")
    .insert({ change_order_id: changeOrderId, storage_path: path, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function deleteChangeOrderImage(
  image: Pick<ChangeOrderImage, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage.from(IMAGES_BUCKET).remove([image.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("change_order_images").delete().eq("id", image.id);
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
  | "quote_declined"
  | "invoice_created"
  | "invoice_sent"
  | "invoice_paid"
  | "expense_logged"
  | "change_order_created"
  | "change_order_approved"
  | "change_order_rejected"
  | "quote_reverted"
  | "project_started";

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

// ---------------------------------------------------------------------------
// Employees (0043) — Employee-Only Mode. An employee is a real, separate
// Supabase Auth user (its own auth.uid()) the owner creates directly (see
// createEmployeeAccount, which calls the create-employee Edge Function —
// the one place a login can be created with an owner-chosen password).
// Every other table's RLS is already scoped to the OWNER's user_id, so an
// employee's auth.uid() never matches those policies — this section is
// deliberately small: it only covers the narrow slice (assigned projects,
// their photos, free-text notes) an employee is allowed to touch at all.
// ---------------------------------------------------------------------------

export type EmployeeStatus = "active" | "deactivated";

export interface Employee {
  id: string;
  owner_user_id: string;
  auth_user_id: string;
  name: string;
  email: string;
  status: EmployeeStatus;
  created_at: string;
}

export interface EmployeeProjectAssignment {
  id: string;
  employee_id: string;
  project_id: string;
  created_at: string;
}

/** A free-text update an employee posted on a project (0043). employee_id
 * is null if that employee has since been removed — see ON DELETE SET
 * NULL on the column; the note itself is never deleted with them. */
export interface ProjectNote {
  id: string;
  project_id: string;
  employee_id: string | null;
  /** Snapshotted at write time (0044) — see that migration's comment for
   * why this isn't resolved from `employees` at read time instead. */
  employee_name: string | null;
  body: string;
  created_at: string;
}

export async function listEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.from("employees").select("*").order("name");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/**
 * The only way to create an employee login — goes through the
 * create-employee Edge Function since setting another user's password
 * directly requires the service-role key, which never lives in the
 * browser. Throws with the function's own message on failure (e.g. email
 * already in use).
 */
export async function createEmployeeAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<Employee> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    employee?: Employee;
    error?: string;
    message?: string;
  }>("create-employee", { body: input });
  if (error) throw error;
  if (!data?.ok || !data.employee) throw new Error(data?.message ?? "Couldn't create employee.");
  return data.employee;
}

/** Deactivating (not deleting) is the primary "remove" action — every
 * employee-scoped RLS policy checks status = 'active', so this takes
 * effect immediately with no need to touch the underlying Auth login. */
export async function updateEmployee(id: string, patch: { status: EmployeeStatus }): Promise<void> {
  const { error } = await supabase.from("employees").update(patch).eq("id", id);
  if (error) throw error;
}

export async function listEmployeeAssignments(employeeId: string): Promise<EmployeeProjectAssignment[]> {
  const { data, error } = await supabase
    .from("employee_project_assignments")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function assignProjectToEmployee(employeeId: string, projectId: string): Promise<void> {
  const { error } = await supabase
    .from("employee_project_assignments")
    .insert({ employee_id: employeeId, project_id: projectId });
  if (error) throw error;
}

export async function unassignProjectFromEmployee(employeeId: string, projectId: string): Promise<void> {
  const { error } = await supabase
    .from("employee_project_assignments")
    .delete()
    .eq("employee_id", employeeId)
    .eq("project_id", projectId);
  if (error) throw error;
}

/**
 * The employee-side project list/detail reads — deliberately minimal and
 * with no `client:` embed at all (unlike PROJECT_SELECT), so an
 * employee's own queries are never even shaped to carry client data, on
 * top of clients' RLS already blocking it outright.
 */
export interface AssignedProject {
  id: string;
  name: string;
  status: ProjectStatus;
  created_at: string;
}

export async function listMyAssignedProjects(): Promise<AssignedProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, created_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAssignedProject(id: string): Promise<AssignedProject> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, created_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const { data, error } = await supabase
    .from("project_notes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function addProjectNote(
  projectId: string,
  employeeId: string,
  employeeName: string,
  body: string,
): Promise<ProjectNote> {
  const { data, error } = await supabase
    .from("project_notes")
    .insert({ project_id: projectId, employee_id: employeeId, employee_name: employeeName, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProjectNote(id: string): Promise<void> {
  const { error } = await supabase.from("project_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Looks up the current session's employee row, if any — this is how the
 * app tells "I'm an employee" apart from "I'm an owner" after sign-in. No
 * row = owner. See src/lib/auth.tsx. */
export async function getMyEmployeeRecord(authUserId: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205") return null;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// CRM — customer records (0048, Phase 1). Contacts/addresses/files/
// activities are all owned through a `clients` join (see that migration's
// security note), not a direct user_id column.
// ---------------------------------------------------------------------------

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  created_at: string;
}

export async function listClientContacts(clientId: string): Promise<ClientContact[]> {
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function addClientContact(
  clientId: string,
  input: {
    name: string;
    role?: string | null;
    phone?: string | null;
    email?: string | null;
    is_primary?: boolean;
  },
): Promise<ClientContact> {
  const { data, error } = await supabase
    .from("client_contacts")
    .insert({
      client_id: clientId,
      name: input.name,
      role: input.role ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_primary: input.is_primary ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClientContact(id: string): Promise<void> {
  const { error } = await supabase.from("client_contacts").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------

export interface ClientAddress {
  id: string;
  client_id: string;
  label: string | null;
  address: string;
  is_billing: boolean;
  created_at: string;
}

export async function listClientAddresses(clientId: string): Promise<ClientAddress[]> {
  const { data, error } = await supabase
    .from("client_addresses")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function addClientAddress(
  clientId: string,
  input: { label?: string | null; address: string; is_billing?: boolean },
): Promise<ClientAddress> {
  const { data, error } = await supabase
    .from("client_addresses")
    .insert({
      client_id: clientId,
      label: input.label ?? null,
      address: input.address,
      is_billing: input.is_billing ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClientAddress(id: string): Promise<void> {
  const { error } = await supabase.from("client_addresses").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------

export interface ClientFile {
  id: string;
  client_id: string;
  storage_path: string;
  name: string | null;
  sort_order: number;
  created_at: string;
}

export async function listClientFiles(clientId: string): Promise<ClientFile[]> {
  const { data, error } = await supabase
    .from("client_files")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** Compresses, uploads, and records the row — same order/rollback as addProjectImage. */
export async function addClientFile(
  clientId: string,
  file: File,
  input: { sort_order?: number } = {},
): Promise<ClientFile> {
  const compressed = await compressImageFile(file);
  const path = `clients/${clientId}/${randomImageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("client_files")
    .insert({
      client_id: clientId,
      storage_path: path,
      name: file.name,
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

export async function deleteClientFile(file: Pick<ClientFile, "id" | "storage_path">): Promise<void> {
  const { error: storageError } = await supabase.storage.from(IMAGES_BUCKET).remove([file.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("client_files").delete().eq("id", file.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Activities — the client-wide timeline (0048). Phase 1 only writes
// manual entries ("log a note/call"); later CRM phases add automatic
// writes (quote sent, pipeline stage changed, etc.) with no schema change.
// ---------------------------------------------------------------------------

export type ActivityKind =
  | "note"
  | "call"
  | "text"
  | "email"
  | "other"
  // Auto-generated kinds (CRM Phases 2+) — the DB column is open text
  // (see 0048's comment), so new kinds never need a migration; this union
  // just keeps callers honest. Not every kind below is wired up to fire
  // automatically yet — added now so later phases don't touch the type.
  | "stage_changed"
  | "quote_created"
  | "quote_sent"
  | "quote_viewed"
  | "proposal_approved"
  | "proposal_rejected"
  | "opportunity_won"
  | "opportunity_lost"
  | "project_created"
  | "invoice_sent"
  | "invoice_paid"
  | "appointment_scheduled"
  | "appointment_completed"
  | "task_completed"
  | "task_created";

export interface Activity {
  id: string;
  client_id: string;
  project_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  opportunity_id: string | null;
  created_by: string;
  kind: string;
  summary: string;
  meta: Record<string, unknown>;
  created_at: string;
  client?: { name: string } | null;
}

export async function listActivities(clientId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** An opportunity's own feed — narrower than listActivities(), which
 * returns everything for the whole customer. */
export async function listActivitiesForOpportunity(opportunityId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

const MANUAL_COMMUNICATION_KINDS = ["note", "call", "text", "email"] as const;

/** CRM Phase 6's "Communication Center" — every manually-logged note/
 * call/text/email across every customer, newest first. Reuses the
 * activities table (no new table): the same manual-log composer on
 * Customer 360 already writes these rows, this just surfaces them
 * cross-customer. Auto-generated kinds (stage_changed, quote_sent,
 * etc.) are excluded — those belong in each record's own activity
 * feed, not the communication log. */
export async function listCommunications(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*, client:clients(name)")
    .in("kind", MANUAL_COMMUNICATION_KINDS)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function logActivity(
  clientId: string,
  kind: ActivityKind,
  summary: string,
  input: {
    project_id?: string | null;
    quote_id?: string | null;
    invoice_id?: string | null;
    opportunity_id?: string | null;
    meta?: Record<string, unknown>;
  } = {},
): Promise<Activity> {
  const { data, error } = await supabase
    .from("activities")
    .insert({
      client_id: clientId,
      kind,
      summary,
      project_id: input.project_id ?? null,
      quote_id: input.quote_id ?? null,
      invoice_id: input.invoice_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      meta: input.meta ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Opportunities — Sales Pipeline (CRM Phase 2, 0049). Every opportunity
// belongs to exactly one customer; a customer can have many over time.
// ---------------------------------------------------------------------------

export type OpportunityStage =
  | "new_lead"
  | "attempting_contact"
  | "contacted"
  | "qualified"
  | "site_visit_scheduled"
  | "site_visit_completed"
  | "estimate_in_progress"
  | "proposal_sent"
  | "follow_up"
  | "won"
  | "lost";

export type OpportunityPriority = "low" | "normal" | "high";

export interface Opportunity {
  id: string;
  client_id: string;
  title: string;
  address: string | null;
  project_type: string | null;
  description: string | null;
  estimated_value: number | null;
  probability: number | null;
  expected_close_date: string | null;
  lead_source: string | null;
  assigned_to: string | null;
  stage: OpportunityStage;
  priority: OpportunityPriority;
  tags: string[];
  measurements: string | null;
  lost_reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_contact_date: string | null;
  quote_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  client?: { name: string } | null;
}

const OPPORTUNITY_SELECT = "*, client:clients(name)";

export async function listOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .order("updated_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** An opportunity's own client (0048/0049, Customer 360 page). */
export async function listOpportunitiesForClient(clientId: string): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  const { data, error } = await supabase.from("opportunities").select(OPPORTUNITY_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Reverse lookup for CRM Phase 5 (Quote/Proposal Integration) — lets a
 * quote screen ask "is this quote tied to a pipeline opportunity?"
 * without the quote itself needing to know about opportunities. Null for
 * a quote created outside the pipeline (the common case). */
export async function getOpportunityByQuoteId(quoteId: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205") return null;
    throw error;
  }
  return data;
}

export async function createOpportunity(input: {
  client_id: string;
  title: string;
  address?: string | null;
  project_type?: string | null;
  description?: string | null;
  estimated_value?: number | null;
  probability?: number | null;
  expected_close_date?: string | null;
  lead_source?: string | null;
  assigned_to?: string | null;
  priority?: OpportunityPriority;
}): Promise<Opportunity> {
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      client_id: input.client_id,
      title: input.title,
      address: input.address ?? null,
      project_type: input.project_type ?? null,
      description: input.description ?? null,
      estimated_value: input.estimated_value ?? null,
      probability: input.probability ?? null,
      expected_close_date: input.expected_close_date ?? null,
      lead_source: input.lead_source ?? null,
      assigned_to: input.assigned_to ?? null,
      priority: input.priority ?? "normal",
    })
    .select(OPPORTUNITY_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateOpportunity(
  id: string,
  patch: Partial<
    Pick<
      Opportunity,
      | "title"
      | "address"
      | "project_type"
      | "description"
      | "estimated_value"
      | "probability"
      | "expected_close_date"
      | "lead_source"
      | "assigned_to"
      | "stage"
      | "priority"
      | "tags"
      | "measurements"
      | "lost_reason"
      | "next_action"
      | "next_action_date"
      | "last_contact_date"
      | "quote_id"
      | "project_id"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw error;
}

/**
 * The Kanban board's drag handler — moves the stage AND records it in the
 * activity timeline in one call, so a stage change is never a silent
 * overwrite (section 3 of the CRM ask).
 */
export async function moveOpportunityStage(
  opportunity: Pick<Opportunity, "id" | "client_id" | "stage">,
  toStage: OpportunityStage,
): Promise<void> {
  await updateOpportunity(opportunity.id, { stage: toStage });
  await logActivity(
    opportunity.client_id,
    "stage_changed",
    `Stage changed: ${opportunityStageLabel(opportunity.stage)} → ${opportunityStageLabel(toStage)}`,
    { opportunity_id: opportunity.id },
  );
}

// Tiny local label map — statusMeta.ts owns the canonical/full version
// (OPPORTUNITY_STAGE_META); this avoids api.ts depending on that UI
// module just to write a plain-text activity summary.
function opportunityStageLabel(stage: OpportunityStage): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Stages that come before real estimate work starts — createQuoteFromOpportunity
// only auto-advances out of these, never regressing an opportunity that's
// already further along (e.g. re-quoting a "proposal_sent" opportunity
// shouldn't knock it back a stage).
const PRE_ESTIMATE_STAGES: OpportunityStage[] = [
  "new_lead",
  "attempting_contact",
  "contacted",
  "qualified",
  "site_visit_scheduled",
  "site_visit_completed",
];

/**
 * CRM Phase 5 (Quote/Proposal Integration) — creates a quote carrying the
 * opportunity's customer, address, description and measurements forward
 * (no retyping), links it back via opportunities.quote_id, advances the
 * stage to "estimate_in_progress" (only if still earlier in the pipeline),
 * and logs it — same combined update+log shape as moveOpportunityStage()
 * and setAppointmentStatus(), so this is never a silent side effect.
 * Never creates a second client or project record; an opportunity that
 * already has a quote_id should route to that existing quote instead of
 * calling this again.
 */
export async function createQuoteFromOpportunity(
  opportunity: Pick<Opportunity, "id" | "client_id" | "stage" | "address" | "description" | "measurements">,
): Promise<Quote> {
  const notes =
    [
      opportunity.address ? `Address: ${opportunity.address}` : null,
      opportunity.description,
      opportunity.measurements ? `Measurements: ${opportunity.measurements}` : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  const quote = await createQuote({ client_id: opportunity.client_id, notes });
  await updateOpportunity(opportunity.id, { quote_id: quote.id });
  await logActivity(opportunity.client_id, "quote_created", "Quote created from opportunity", {
    opportunity_id: opportunity.id,
    quote_id: quote.id,
  });
  if (PRE_ESTIMATE_STAGES.includes(opportunity.stage)) {
    await moveOpportunityStage(opportunity, "estimate_in_progress");
  }
  return quote;
}

// ---------------------------------------------------------------------------

export interface OpportunityPhoto {
  id: string;
  opportunity_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
}

export async function listOpportunityPhotos(opportunityId: string): Promise<OpportunityPhoto[]> {
  const { data, error } = await supabase
    .from("opportunity_photos")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function addOpportunityPhoto(
  opportunityId: string,
  file: File,
  input: { sort_order?: number } = {},
): Promise<OpportunityPhoto> {
  const compressed = await compressImageFile(file);
  const path = `opportunities/${opportunityId}/${randomImageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("opportunity_photos")
    .insert({ opportunity_id: opportunityId, storage_path: path, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function deleteOpportunityPhoto(
  photo: Pick<OpportunityPhoto, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage.from(IMAGES_BUCKET).remove([photo.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("opportunity_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tasks & Follow-ups (CRM Phase 3, 0050). A task can stand fully alone
// (no client/opportunity/project) — the "global task view" the ask
// requires — so unlike every CRM table so far, it can't be owned via a
// clients join; it uses a direct user_id column instead, backed by the
// same "employees excluded" restrictive policy 0047 added for that exact
// shape of table.
// ---------------------------------------------------------------------------

export type TaskType =
  | "call"
  | "text"
  | "email"
  | "site_visit"
  | "prepare_estimate"
  | "send_proposal"
  | "follow_up"
  | "collect_deposit"
  | "schedule_project"
  | "general_task";

export type TaskPriority = "low" | "normal" | "high";
export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  client_id: string | null;
  opportunity_id: string | null;
  project_id: string | null;
  assigned_to: string | null;
  priority: TaskPriority;
  task_type: TaskType;
  completed: boolean;
  completed_at: string | null;
  reminder_at: string | null;
  recurrence: TaskRecurrence | null;
  created_at: string;
  updated_at: string;
  client?: { name: string } | null;
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  site_visit: "Site Visit",
  prepare_estimate: "Prepare Estimate",
  send_proposal: "Send Proposal",
  follow_up: "Follow Up",
  collect_deposit: "Collect Deposit",
  schedule_project: "Schedule Project",
  general_task: "General Task",
};

const TASK_SELECT = "*, client:clients(name)";

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function listTasksForClient(clientId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("client_id", clientId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function listTasksForOpportunity(opportunityId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("opportunity_id", opportunityId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createTask(input: {
  title: string;
  description?: string | null;
  due_at?: string | null;
  client_id?: string | null;
  opportunity_id?: string | null;
  project_id?: string | null;
  assigned_to?: string | null;
  priority?: TaskPriority;
  task_type?: TaskType;
  reminder_at?: string | null;
  recurrence?: TaskRecurrence | null;
}): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      due_at: input.due_at ?? null,
      client_id: input.client_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      project_id: input.project_id ?? null,
      assigned_to: input.assigned_to ?? null,
      priority: input.priority ?? "normal",
      task_type: input.task_type ?? "general_task",
      reminder_at: input.reminder_at ?? null,
      recurrence: input.recurrence ?? null,
    })
    .select(TASK_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | "title"
      | "description"
      | "due_at"
      | "client_id"
      | "opportunity_id"
      | "project_id"
      | "assigned_to"
      | "priority"
      | "task_type"
      | "reminder_at"
      | "recurrence"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Appointments & Site Visits (CRM Phase 4, 0051). Ownership-through-clients,
// same as every CRM table except tasks (see the comment above) — an
// appointment always belongs to a customer.
// ---------------------------------------------------------------------------

export type AppointmentType =
  | "phone_consultation"
  | "site_visit"
  | "estimate_appointment"
  | "design_meeting"
  | "proposal_review"
  | "follow_up";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  client_id: string;
  opportunity_id: string | null;
  type: AppointmentType;
  date_time: string;
  duration_minutes: number;
  address: string | null;
  status: AppointmentStatus;
  notes: string | null;
  assigned_to: string | null;
  reminder_at: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
  client?: { name: string } | null;
}

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  phone_consultation: "Phone Consultation",
  site_visit: "Site Visit",
  estimate_appointment: "Estimate Appointment",
  design_meeting: "Design Meeting",
  proposal_review: "Proposal Review",
  follow_up: "Follow-Up",
};

const APPOINTMENT_SELECT = "*, client:clients(name)";

export async function listAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .order("date_time", { ascending: true });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function listAppointmentsForClient(clientId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("client_id", clientId)
    .order("date_time", { ascending: true });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function listAppointmentsForOpportunity(opportunityId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("opportunity_id", opportunityId)
    .order("date_time", { ascending: true });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createAppointment(input: {
  client_id: string;
  opportunity_id?: string | null;
  type?: AppointmentType;
  date_time: string;
  duration_minutes?: number;
  address?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  reminder_at?: string | null;
}): Promise<Appointment> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_id: input.client_id,
      opportunity_id: input.opportunity_id ?? null,
      type: input.type ?? "site_visit",
      date_time: input.date_time,
      duration_minutes: input.duration_minutes ?? 60,
      address: input.address ?? null,
      notes: input.notes ?? null,
      assigned_to: input.assigned_to ?? null,
      reminder_at: input.reminder_at ?? null,
    })
    .select(APPOINTMENT_SELECT)
    .single();
  if (error) throw error;
  await logActivity(input.client_id, "appointment_scheduled", `Appointment scheduled: ${APPOINTMENT_TYPE_LABEL[input.type ?? "site_visit"]}`, {
    opportunity_id: input.opportunity_id ?? null,
    meta: { appointment_id: data.id, date_time: input.date_time },
  });
  return data;
}

export async function updateAppointment(
  id: string,
  patch: Partial<
    Pick<
      Appointment,
      | "type"
      | "date_time"
      | "duration_minutes"
      | "address"
      | "notes"
      | "assigned_to"
      | "reminder_at"
      | "status"
      | "outcome"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("appointments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) throw error;
}

/** Marks an appointment as completed (or cancelled/no-show) and, for a
 * completion, logs it to the activity timeline — same combined
 * update+log pattern as moveOpportunityStage(), so a status change is
 * never silent. */
export async function setAppointmentStatus(
  appointment: Pick<Appointment, "id" | "client_id" | "opportunity_id" | "type">,
  status: AppointmentStatus,
  outcome?: string | null,
): Promise<void> {
  await updateAppointment(appointment.id, { status, outcome: outcome ?? null });
  if (status === "completed") {
    await logActivity(
      appointment.client_id,
      "appointment_completed",
      `Appointment completed: ${APPOINTMENT_TYPE_LABEL[appointment.type]}${outcome ? ` — ${outcome}` : ""}`,
      { opportunity_id: appointment.opportunity_id, meta: { appointment_id: appointment.id } },
    );
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection (0048) — client-side only, checked against the
// already-loaded client list before creating a new one (this app's scale
// doesn't need a server-side fuzzy-search function). Never merges
// automatically; only surfaces a warning so the user can pick the
// existing record instead.
// ---------------------------------------------------------------------------

const normalizePhone = (v: string) => v.replace(/\D/g, "");
const normalizeEmail = (v: string) => v.trim().toLowerCase();
const normalizeName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

export interface PossibleDuplicate {
  client: Client;
  reason: "phone" | "email" | "name";
}

/** Phone/email matches are exact-after-normalizing (reliable signals);
 * name matches are a looser substring check (a hint, not a hard match)
 * since names collide far more easily. */
export function findPossibleDuplicates(
  input: { name?: string; email?: string; phone?: string },
  clients: Client[],
): PossibleDuplicate[] {
  const name = input.name ? normalizeName(input.name) : "";
  const email = input.email ? normalizeEmail(input.email) : "";
  const phone = input.phone ? normalizePhone(input.phone) : "";

  const results: PossibleDuplicate[] = [];
  for (const c of clients) {
    if (phone && c.phone && normalizePhone(c.phone) === phone) {
      results.push({ client: c, reason: "phone" });
      continue;
    }
    if (email && c.email && normalizeEmail(c.email) === email) {
      results.push({ client: c, reason: "email" });
      continue;
    }
    if (name.length >= 3 && normalizeName(c.name).includes(name)) {
      results.push({ client: c, reason: "name" });
    }
  }
  return results;
}
