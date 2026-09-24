import { supabase } from "./supabase";
import { materialsLineTotal } from "./materialsMath";
import { compressImageFile, randomImageFilename } from "./imageUpload";
import type { MeasurementRow } from "./measurements";

/** Private Storage bucket (0023) holding both quote-item and project
 * photos, split by path prefix (`quote-items/…`, `projects/…`). */
const IMAGES_BUCKET = "images";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pure job-lifecycle — sales stage lives on the opportunity, billing
 * state is derived live from invoices (see financials.ts's billing
 * badge). estimating -> scheduled -> in_progress -> complete, or -> lost
 * from any pre-complete state. Kept in sync with actual_start_date/
 * actual_end_date by a DB trigger (migration 0073) — moving to
 * in_progress/complete stamps the matching date if it's still null, and
 * setting a date bumps the status forward the same way; never backward. */
export type ProjectStatus = "estimating" | "scheduled" | "in_progress" | "complete" | "lost";
/** "not_selected" (migration 0073) — a sibling quote option that lost
 * once a different option on the same project was signed. Distinct from
 * "declined" (the client explicitly rejected it); a not-selected quote
 * was never up for a decision on its own. Excluded from every total the
 * same way declined already is. Set only by the Won transaction
 * (apply_quote_signed/mark_opportunity_won), never directly by the UI. */
export type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "not_selected";
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

/** A user's own editable list of lead sources (Settings > Lead sources,
 * migration 0077) — same "denormalized text, not a hard FK" shape as
 * Suppliers: opportunities.lead_source stays a plain text column, this
 * table is purely the dropdown's source of truth. */
export interface LeadSource {
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
  /** Site address — copied once from the opportunity at lazy-creation
   * time (migration 0074), if this project came from one. Null for a
   * walk-in project created directly, same as everything else about it. */
  address: string | null;
  status: ProjectStatus;
  /** Legacy month-precision field (0053) — superseded by
   * scheduled_start_date/scheduled_end_date (0058) as of the Bookings
   * calendar. Nothing new reads or writes this; left in place
   * (never dropped) since old rows were backfilled from it. */
  target_install_month: string | null;
  /** Day-precision scheduling (0058) — the Bookings calendar's
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
  /** Cost Plan / Labor productivity metrics (migration 0085) — square
   * footage of the job (paver patio, retaining wall face, …). Nullable;
   * per-sqft labor metrics simply don't show until this is filled in. Not
   * split by scope — a single whole-job number, same granularity as
   * jobSizeLabel()'s free-text reading of the quote. */
  size_sqft: number | null;
  created_at: string;
  updated_at: string;
  client?: ClientRef | null;
  /** Job type tags (Settings > Categories — "Job Categories"), many-to-many
   * (migration 0079). A job can be several at once (Paver patio + Outdoor
   * kitchen + Fire pit). This is the durable copy once a project exists —
   * see projectCategoryIds() and opportunityCategoryIds(). Never drives
   * Revenue by category (that's quote_items.category_id only); these are
   * descriptive tags, not money. */
  project_categories?: { category_id: string }[];
  /** The CRM opportunity this project was created for, if any (reverse
   * embed of opportunities.project_id — at most one, 1:1 via 0073's unique
   * partial index). Drives isPreSaleProject(). */
  opportunities?: { id: string; stage: OpportunityStage }[];
}

/**
 * A project auto-created for an opportunity that hasn't been Won yet (New
 * Lead → Revisions, or Lost). It holds the estimate (cost plan, quotes,
 * photos) but isn't a real job: listProjects()/listProjectsForClient() leave
 * it out, so it's missing from the Projects list, Bookings, Ongoing jobs,
 * Revenue, job counts and project pickers. Derived from the opportunity's
 * stage — never a stored flag — so moving to Won (or back out of it)
 * shows/hides it everywhere with no sync step. Projects created directly
 * (no opportunity) are never pre-sale.
 */
export function isPreSaleProject(project: Pick<Project, "opportunities">): boolean {
  return !!project.opportunities?.some((o) => o.stage !== "won");
}

/** Flattens Project.project_categories into plain ids, in a stable order
 * (Settings > Categories' own sort_order isn't carried on the join row, so
 * callers that need name-ordered chips should sort via a categories list). */
export function projectCategoryIds(project: Pick<Project, "project_categories">): string[] {
  return (project.project_categories ?? []).map((r) => r.category_id);
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
  /** Change Order Builder (0069) — set when this invoice bills an approved
   * change order, either on its own (createInvoiceForChangeOrder) or
   * rolled into a broader project invoice the user links manually. Null
   * for an ordinary invoice. */
  change_order_id: string | null;
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
  /** Order Sheet material category (0089) — see ORDER_SHEET_CATEGORIES.
   * Prefills a Materials Sheet line's own `category` the moment this
   * item is picked; never required, never locked. */
  category: string | null;
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

/** Order Sheet (0089) material category — the same free-text-in-the-DB,
 * list-can-grow-without-a-migration convention as MATERIAL_TYPES above.
 * Stored directly as the human-readable string (no separate value/label
 * split) since Product Catalog's own `category` column already works
 * that way (0036) — a Materials Sheet line's `category` and a Catalog
 * product's `category` are meant to be the same plain string either way.
 * "Other" and an untagged (null) line both group under "Other /
 * Uncategorized" on the generated order sheet — see src/lib/orderSheet.ts. */
export const ORDER_SHEET_CATEGORIES: string[] = [
  "Pavers",
  "Wall Block",
  "Caps",
  "Base Gravel",
  "Bedding Sand",
  "Polymeric Sand",
  "Edging",
  "Adhesive",
  "Fabric",
  "Other",
];

export interface MaterialsItem {
  id: string;
  section_id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
  /** Optional cost category (Settings > Expense categories). Null = uncategorized. */
  expense_category_id: string | null;
  /** Order Sheet material category (0089) — see ORDER_SHEET_CATEGORIES.
   * Prefilled from the source Catalog product / Price Book item at pick
   * time, but never locked — always a plain editable dropdown. Null
   * groups under "Other / Uncategorized" on a generated order sheet. */
  category: string | null;
  /** Unit of measure — one of MATERIAL_UNITS (sq ft, piece, layer, pallet,
   * ton, bag, roll, tube) or a custom one (0093). Label only — not in the math. */
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
  /** Waste allowance, every line regardless of source. Part of the math:
   * required quantity = quantity × (1 + waste%), which drives the line
   * total, materialsCogs() and the suggested order quantity — see
   * src/lib/materialsMath.ts. */
  waste_percent: number;
  /** Chosen color (0093) — from the Catalog product's color list or typed
   * in. Shown with the name everywhere (materialLineLabel). Null = none.
   * Undefined until migration 0093 has run. */
  color?: string | null;
  /** Unit conversion (0080): "1 conversion_unit = conversion_factor x
   * unit" — e.g. unit "sf", conversion_unit "pallet", factor 108. Lets a
   * delivery line logged in a different (but equivalent) unit than this
   * line still roll into Ordered/Delivered. Either both set or both null. */
  conversion_unit: string | null;
  conversion_factor: number | null;
  /** Close-out reconciliation (Phase 6, 0080) — set when Delivered != Used
   * is resolved at project Complete. Null until reconciled. */
  reconciled_at: string | null;
  disposition: "returned" | "kept" | "waste" | null;
  /** Credit for a returned quantity — reduces actual material cost. Only
   * meaningful when disposition = 'returned'. */
  return_credit: number | null;
  /** Track / Don't Track (0086) — whether this line shows up in the live
   * Material Tracker (Ordered/Delivered/Used, status, alerts) on a tracked
   * sheet. Execution-tracking only: never affects estimated/actual cost,
   * which always includes every line regardless of this flag — see
   * executionTrackedLines() in materialTracking.ts. Defaults true so every
   * existing line keeps tracking exactly as it did before this flag existed. */
  tracked: boolean;
  /** Only populated where the select asks for it (tracked-sheet reads) —
   * every baseline ever snapshotted for this line, newest first. The
   * CURRENT baseline is materials_item_baselines[0]; empty = never
   * snapshotted (an untracked line, or a tracked one whose baseline
   * trigger hasn't fired yet). */
  materials_item_baselines?: MaterialsItemBaseline[];
}

/** An append-only estimate snapshot (0080) — see snapshot_sheet_baselines()/
 * revise_material_baseline() in the DB. Never updated or deleted; a
 * "revision" is just a new row. */
export interface MaterialsItemBaseline {
  id: string;
  materials_item_id: string;
  quantity: number;
  unit_cost: number;
  unit: string | null;
  /** Null for the automatic first snapshot (Won / change order approval);
   * set for every explicit "Revise estimate". */
  reason: string | null;
  created_at: string;
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

// ---------------------------------------------------------------------------
// Materials usage logs (0080) — what actually got used against a tracked
// sheet line. See src/lib/materialTracking.ts for how these roll up into
// a line's "Used" quantity.
// ---------------------------------------------------------------------------

export interface MaterialsUsageLog {
  id: string;
  materials_item_id: string;
  quantity: number;
  logged_at: string;
  note: string | null;
  /** Free-text — who logged it (a crew member's name), not a real user
   * reference. Null reads as the owner. */
  logged_by: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export async function listUsageLogsForItem(materialsItemId: string): Promise<MaterialsUsageLog[]> {
  const { data, error } = await supabase
    .from("materials_usage_logs")
    .select("*")
    .eq("materials_item_id", materialsItemId)
    .order("logged_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** For a whole sheet's worth of lines in one query — the Live Sheet View
 * needs every tracked line's Used total at once, not one query per row. */
export async function listUsageLogsForItems(materialsItemIds: string[]): Promise<MaterialsUsageLog[]> {
  if (materialsItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("materials_usage_logs")
    .select("*")
    .in("materials_item_id", materialsItemIds)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** materials_item_id is the audit row's permanent anchor (0081) — a
 * 'deleted' event's own log row won't exist anymore, so it can't be the
 * thing RLS/lookups key off. */
async function logUsageEvent(
  usageLogId: string,
  materialsItemId: string,
  kind: "created" | "edited" | "deleted",
  before: { quantity: number; note: string | null } | null,
  after: { quantity: number; note: string | null } | null,
): Promise<void> {
  const { error } = await supabase.from("materials_usage_log_events").insert({
    materials_usage_log_id: usageLogId,
    materials_item_id: materialsItemId,
    kind,
    before_quantity: before?.quantity ?? null,
    before_note: before?.note ?? null,
    after_quantity: after?.quantity ?? null,
    after_note: after?.note ?? null,
  });
  if (error) throw error;
}

export async function addUsageLog(input: {
  materials_item_id: string;
  quantity: number;
  logged_at?: string;
  note?: string | null;
  logged_by?: string | null;
  photo_path?: string | null;
}): Promise<MaterialsUsageLog> {
  const { data, error } = await supabase
    .from("materials_usage_logs")
    .insert({
      materials_item_id: input.materials_item_id,
      quantity: input.quantity,
      logged_at: input.logged_at ?? new Date().toISOString().slice(0, 10),
      note: input.note ?? null,
      logged_by: input.logged_by ?? null,
      photo_path: input.photo_path ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  await logUsageEvent(data.id, data.materials_item_id, "created", null, { quantity: data.quantity, note: data.note });
  return data;
}

export async function updateUsageLog(
  id: string,
  patch: Partial<Pick<MaterialsUsageLog, "quantity" | "logged_at" | "note" | "photo_path">>,
): Promise<void> {
  const { data: before, error: readError } = await supabase
    .from("materials_usage_logs")
    .select("materials_item_id, quantity, note")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const { data: after, error } = await supabase
    .from("materials_usage_logs")
    .update(patch)
    .eq("id", id)
    .select("quantity, note")
    .single();
  if (error) throw error;
  await logUsageEvent(id, before.materials_item_id, "edited", before, after);
}

export async function deleteUsageLog(id: string): Promise<void> {
  const { data: before, error: readError } = await supabase
    .from("materials_usage_logs")
    .select("materials_item_id, quantity, note")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  await logUsageEvent(id, before.materials_item_id, "deleted", before, null);
  const { error } = await supabase.from("materials_usage_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function listUsageLogEventsForItem(materialsItemId: string): Promise<
  {
    id: string;
    kind: "created" | "edited" | "deleted";
    before_quantity: number | null;
    before_note: string | null;
    after_quantity: number | null;
    after_note: string | null;
    created_at: string;
  }[]
> {
  const { data, error } = await supabase
    .from("materials_usage_log_events")
    .select("id, kind, before_quantity, before_note, after_quantity, after_note, created_at")
    .eq("materials_item_id", materialsItemId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Compresses and uploads a usage log's optional photo, returning the
 * storage path to pass into addUsageLog()/updateUsageLog() — scoped under
 * the materials_item (not the usage log itself, which doesn't exist yet
 * on the first-log path) so this can run before the log row is created.
 * Storage RLS for the "materials-usage/" prefix is 0082. */
export async function uploadUsageLogPhoto(materialsItemId: string, file: File): Promise<string> {
  const compressed = await compressImageFile(file);
  const path = `materials-usage/${materialsItemId}/${randomImageFilename(file.name)}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
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

export type ChangeOrderStatus = "draft" | "sent" | "approved" | "declined";
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
 * draft/sent/declined ones never move any number (see below).
 *
 * `amount` is the persisted, canonical total — same "stored, app keeps it
 * in sync" convention invoices.amount uses. The Change Order Builder
 * (0069) always recomputes it from change_order_sections/items on save
 * (changeOrderTotal()), the same way it always wrote a single amount, just
 * derived instead of typed in — every existing reader here keeps working
 * unchanged. */
export interface ChangeOrder {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string | null;
  reason: ChangeOrderReason | null;
  amount: number;
  status: ChangeOrderStatus;
  /** Signed working days this change order adds (positive), saves
   * (negative), or null/0 for no schedule change. Only applies to the
   * project's estimated duration once the change order is approved. */
  schedule_impact_days: number | null;
  approved_at: string | null;
  /** Client Hub (0065) — a client-side approval/decline now captures a
   * signature name (and IP), same as a quote's signed_by/signed_ip; both
   * stay null for a contractor-side one-tap approval, which still works
   * exactly as before. */
  approved_by: string | null;
  approved_ip: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  /** Change Order Builder (0069) — the same public share-token signature
   * mechanism quotes use (share_token/signed_at/signed_by). */
  share_token: string | null;
  signed_at: string | null;
  signed_by: string | null;
  created_at: string;
  /** Material budget tracking (0080) — one-to-one, same shape as
   * quotes.material_sheet_id. Once this change order is approved, its
   * linked sheet starts tracking (baseline snapshotted automatically). */
  material_sheet_id: string | null;
  // Only populated by getChangeOrder() (the builder's own fetch) — list
  // reads (listChangeOrders) stay flat/lightweight, same split as
  // getQuote() vs. the rest of the app's lighter quote reads.
  change_order_sections?: ChangeOrderSection[];
  project?: ProjectRef | null;
}

export interface ChangeOrderItemImage {
  id: string;
  change_order_item_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
}

export interface ChangeOrderItem {
  id: string;
  section_id: string;
  name: string;
  description: string | null;
  /** Unit price — negative for a credit/removal line. Line total = quantity × price. */
  price: number;
  quantity: number;
  unit: string | null;
  category_id: string | null;
  sort_order: number;
  change_order_item_images: ChangeOrderItemImage[];
}

export interface ChangeOrderSection {
  id: string;
  change_order_id: string;
  name: string;
  sort_order: number;
  change_order_items: ChangeOrderItem[];
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
 * the live page. quoteTotal() below is gated by this: a quote's total (and
 * everything derived from it — contract value, deposits, invoicing,
 * revenue-by-category) only ever counts what's actually been committed to,
 * never speculative optional work nobody picked. Once a quote is approved
 * its sections/items are locked (see the 0033 lock-approved-quotes
 * triggers), so "currently selected" and "selected at signing" are the
 * same thing from that point on. */
export function quoteItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  if (section.is_optional || item.is_optional) return item.client_selected;
  return true;
}

/** Line total = quantity × unit price. Quantity defaults to 1 (pre-0014 rows). */
export function quoteLineTotal(item: { price: number; quantity?: number | null }): number {
  return Number(item.price) * (item.quantity == null ? 1 : Number(item.quantity));
}

/** Quote total = required items + whatever optional items/sections the
 * client has actually selected (quoteItemIncluded()) — the same number
 * shown everywhere a quote's total appears (the Quote builder's headline,
 * quote list, project rollups/contract value, dashboard, bookings). An
 * optional item nobody picked will never be billed, so it never counts
 * toward the total — "quote total" and "what will actually be invoiced"
 * are the same figure now, everywhere in the app. */
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

/** Won means signed (see the Pipeline's stage meanings) — deposit is
 * tracked separately, here, not as part of the pipeline. A project's
 * deposit counts as received once paid invoices cover the headline
 * quote's deposit_percentage of the contract total; there's no dedicated
 * "deposit invoice" concept in the schema, so this is derived, live, from
 * the same figures every other money screen already shows (no second
 * calculation path) — never a stored flag, so it clears the moment enough
 * gets paid, with no extra bookkeeping. Only flags true once
 * DEPOSIT_GRACE_DAYS have passed since signing, so a job that signed
 * yesterday doesn't immediately read as overdue. */
export const DEPOSIT_GRACE_DAYS = 3;

export function isDepositOverdue(
  headlineQuote: Quote | undefined,
  contractTotal: number,
  paidTotal: number,
  now: Date = new Date(),
): boolean {
  if (!headlineQuote?.signed_at) return false;
  const daysSinceSigned = (now.getTime() - new Date(headlineQuote.signed_at).getTime()) / 86_400_000;
  if (daysSinceSigned < DEPOSIT_GRACE_DAYS) return false;
  const depositAmount = contractTotal * (headlineQuote.deposit_percentage / 100);
  if (depositAmount <= 0) return false;
  return paidTotal < depositAmount;
}

/** Materials cost of goods = sum of every line's waste-adjusted quantity ×
 * unit_cost (materialsLineTotal). */
export function materialsCogs(sections: MaterialsSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.materials_items ?? []) {
      total += materialsLineTotal(item);
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
// Lead sources (Settings > Lead sources, 0077)
// ---------------------------------------------------------------------------

export async function listLeadSources(): Promise<LeadSource[]> {
  const { data, error } = await supabase.from("lead_sources").select("*").order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createLeadSource(input: { name: string; sort_order?: number }): Promise<LeadSource> {
  const { data, error } = await supabase
    .from("lead_sources")
    .insert({ name: input.name, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLeadSource(
  id: string,
  patch: Partial<Pick<LeadSource, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("lead_sources").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteLeadSource(id: string): Promise<void> {
  const { error } = await supabase.from("lead_sources").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const PROJECT_SELECT =
  "*, client:clients(name, email, phone, address), project_categories(category_id), opportunities(id, stage)";

/** Every real job — pre-sale projects (see isPreSaleProject) excluded. */
export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).filter((p) => !isPreSaleProject(p));
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
 * listProjects()'s full-list use everywhere else. Real jobs only, same as
 * listProjects() (pre-sale ones live on the client's opportunities). */
export async function listProjectsForClient(clientId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).filter((p) => !isPreSaleProject(p));
}

export async function createProject(input: {
  name: string;
  client_id: string | null;
  address?: string | null;
  status?: ProjectStatus;
}): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      client_id: input.client_id,
      address: input.address ?? null,
      status: input.status ?? "estimating",
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
      | "address"
      | "status"
      | "target_install_month"
      | "scheduled_start_date"
      | "scheduled_end_date"
      | "estimated_duration_days"
      | "actual_start_date"
      | "actual_end_date"
      | "size_sqft"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

/** Replaces this project's full set of job-type tags (migration 0079) —
 * delete-then-insert rather than a diff, since the caller always has the
 * complete desired set from a multi-select, not an incremental add/remove. */
export async function setProjectCategories(projectId: string, categoryIds: string[]): Promise<void> {
  const { error: delError } = await supabase.from("project_categories").delete().eq("project_id", projectId);
  if (delError) throw delError;
  if (categoryIds.length === 0) return;
  const { error: insError } = await supabase
    .from("project_categories")
    .insert(categoryIds.map((category_id) => ({ project_id: projectId, category_id })));
  if (insError) throw insError;
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
  /** Material budget tracking alert thresholds (0080). Over-order: a
   * tracked line's Ordered quantity is flagged once it exceeds Estimated
   * by more than this %. Not-ordered: a tracked line with nothing ordered
   * yet is flagged once the project's scheduled start is within this many
   * days (or has passed) — see src/lib/materialTracking.ts. */
  material_over_order_margin_pct: number;
  material_not_ordered_alert_days: number;
  /** Labor Plan / Tracking (0085) — the shared fallback hourly rate used to
   * prefill a labor entry when the worker isn't an employee with their own
   * default_hourly_rate (or is, but hasn't had one set). */
  default_labor_rate: number;
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
  material_over_order_margin_pct: 10,
  material_not_ordered_alert_days: 5,
  default_labor_rate: 45,
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
    material_over_order_margin_pct:
      data.material_over_order_margin_pct ?? BUSINESS_PROFILE_FALLBACK.material_over_order_margin_pct,
    material_not_ordered_alert_days:
      data.material_not_ordered_alert_days ?? BUSINESS_PROFILE_FALLBACK.material_not_ordered_alert_days,
    default_labor_rate: data.default_labor_rate ?? BUSINESS_PROFILE_FALLBACK.default_labor_rate,
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
      material_over_order_margin_pct: merged.material_over_order_margin_pct,
      material_not_ordered_alert_days: merged.material_not_ordered_alert_days,
      default_labor_rate: merged.default_labor_rate,
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
    material_over_order_margin_pct:
      data.material_over_order_margin_pct ?? BUSINESS_PROFILE_FALLBACK.material_over_order_margin_pct,
    material_not_ordered_alert_days:
      data.material_not_ordered_alert_days ?? BUSINESS_PROFILE_FALLBACK.material_not_ordered_alert_days,
    default_labor_rate: data.default_labor_rate ?? BUSINESS_PROFILE_FALLBACK.default_labor_rate,
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
// Bookings settings (0054) — one row per user, in the backlog_settings DB
// table (name unchanged — see the "renaming Seasonal backlog to Bookings"
// task: DB objects only get renamed when literally named "backlog"). Used
// to back Settings > Seasonal capacity, a per-month $ capacity figure the
// Dashboard Bookings card compared committed work against; removed as not
// useful (the capacity setting, its Settings page, and this whole get/save
// module all went together — nothing else ever read this table). The
// backlog_settings table itself is left in place, unread.
// ---------------------------------------------------------------------------

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

/** Every image across several projects, most-recent first, in ONE request —
 * the redesigned Ongoing Jobs card's cover-photo source. Callers pick the
 * first row per project_id (already sorted) rather than issuing a
 * listProjectImages() call per card. */
export async function listProjectImagesForProjects(projectIds: string[]): Promise<ProjectImage[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("project_images")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (error) {
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
  category?: string | null;
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
      category: input.category ?? null,
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
    Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id" | "material_type" | "category" | "specs">
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
  /** Color options (0093) for the line item's Color dropdown. Empty when
   * none are on file — the dropdown then just takes a typed color. */
  colors?: string[];
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
 * sort. Mirrors sortQuote() below for quote_sections/quote_items. Also
 * sorts each item's baselines newest-first, so materials_item_baselines[0]
 * is always "the current baseline" without a fragile multi-level PostgREST
 * embedded-order clause. */
function sortMaterialsSections(sections: MaterialsSection[]): MaterialsSection[] {
  for (const s of sections) {
    s.materials_items?.sort((a, b) => a.sort_order - b.sort_order);
    for (const item of s.materials_items ?? []) {
      item.materials_item_baselines?.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
  }
  return sections;
}

export async function listAllMaterialsSections(): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select(`*, materials_items(${MATERIALS_ITEM_WITH_BASELINES})`)
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

const MATERIALS_ITEM_WITH_BASELINES = "*, materials_item_baselines(*)";

export async function listMaterials(projectId: string): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select(`*, materials_items(${MATERIALS_ITEM_WITH_BASELINES})`)
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return sortMaterialsSections(data ?? []);
}

export async function listMaterialsBySheet(sheetId: string): Promise<MaterialsSection[]> {
  const { data, error } = await supabase
    .from("materials_sections")
    .select(`*, materials_items(${MATERIALS_ITEM_WITH_BASELINES})`)
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
    category?: string | null;
    unit?: string | null;
    price_book_item_id?: string | null;
    catalog_product_id?: string | null;
    waste_percent?: number;
    conversion_unit?: string | null;
    conversion_factor?: number | null;
    tracked?: boolean;
    color?: string | null;
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
      category: input.category ?? null,
      unit: input.unit ?? null,
      price_book_item_id: input.price_book_item_id ?? null,
      catalog_product_id: input.catalog_product_id ?? null,
      waste_percent: input.waste_percent ?? 0,
      conversion_unit: input.conversion_unit ?? null,
      conversion_factor: input.conversion_factor ?? null,
      tracked: input.tracked ?? true,
      // Only sent when set, so adding a line still works before migration
      // 0093 (which adds the column) has been run.
      ...(input.color ? { color: input.color } : {}),
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
      | "category"
      | "unit"
      | "price_book_item_id"
      | "catalog_product_id"
      | "waste_percent"
      | "conversion_unit"
      | "conversion_factor"
      | "tracked"
      | "color"
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

/** Explicit "Revise estimate" (0080) — records a NEW baseline for this
 * line with a reason, keeping every earlier one in history. Does not touch
 * the live editable quantity/unit_cost on the sheet (those already changed;
 * this just makes the change official for estimate-vs-actual tracking). */
export async function reviseMaterialBaseline(materialsItemId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("revise_material_baseline", {
    p_materials_item_id: materialsItemId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Close-out reconciliation (Phase 6, 0080) — records what happened to a
 * tracked line's leftover (Delivered - Used), once at project Complete.
 * return_credit only meaningful with disposition 'returned'; cleared
 * otherwise so a stale credit can't linger under the wrong disposition. */
export async function reconcileMaterialsItem(
  id: string,
  input: { disposition: "returned" | "kept" | "waste"; return_credit?: number | null },
): Promise<void> {
  const { error } = await supabase
    .from("materials_items")
    .update({
      disposition: input.disposition,
      return_credit: input.disposition === "returned" ? (input.return_credit ?? 0) : null,
      reconciled_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Design-for-what's-next (0080) — one row per completed line, baseline vs.
 * final used. Nothing reads this yet; it's populated so waste-rate
 * learning can plug in later without a schema change. Never blocks or
 * surfaces an error to the reconciliation flow it's called from — losing
 * a learning data point is not worth failing the actual reconciliation
 * over. */
export async function recordMaterialLearningSnapshot(input: {
  project_id: string;
  catalog_product_id: string | null;
  material_name: string;
  baseline_quantity: number;
  final_used: number;
  unit: string | null;
}): Promise<void> {
  const { error } = await supabase.from("materials_learning_snapshots").insert(input);
  if (error) console.warn("Failed to record material learning snapshot:", error);
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
    change_order_id?: string | null;
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
      change_order_id: input.change_order_id ?? null,
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
    Pick<
      Invoice,
      "amount" | "status" | "due_date" | "notes" | "paid_at" | "project_id" | "quote_id" | "change_order_id"
    >
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
const CHANGE_ORDER_SELECT =
  "*, project:projects(name, client:clients(name)), change_order_sections(*, change_order_items(*, change_order_item_images(*)))";

function sortChangeOrder(co: ChangeOrder): ChangeOrder {
  co.change_order_sections?.sort((a, b) => a.sort_order - b.sort_order);
  for (const s of co.change_order_sections ?? []) {
    s.change_order_items?.sort((a, b) => a.sort_order - b.sort_order);
    for (const i of s.change_order_items ?? []) {
      i.change_order_item_images = i.change_order_item_images ?? [];
      i.change_order_item_images.sort((a, b) => a.sort_order - b.sort_order);
    }
  }
  return co;
}

/** Creates an empty draft change order and navigates the builder to it —
 * same "insert blank, then edit" pattern as createQuote(). */
export async function createChangeOrder(input: {
  project_id: string;
  title?: string;
  description?: string | null;
  reason?: ChangeOrderReason | null;
}): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from("change_orders")
    .insert({
      project_id: input.project_id,
      title: input.title ?? "",
      description: input.description ?? null,
      reason: input.reason ?? null,
      amount: 0,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return getChangeOrder(data.id);
}

export async function getChangeOrder(id: string): Promise<ChangeOrder> {
  const { data, error } = await supabase.from("change_orders").select(CHANGE_ORDER_SELECT).eq("id", id).single();
  if (error) throw error;
  return sortChangeOrder(data);
}

export async function updateChangeOrder(
  id: string,
  patch: Partial<
    Pick<
      ChangeOrder,
      | "title"
      | "description"
      | "reason"
      | "amount"
      | "status"
      | "schedule_impact_days"
      | "approved_at"
      | "signed_at"
      | "signed_by"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("change_orders").update(patch).eq("id", id);
  if (error) throw error;
}

/** Same one-to-one "linking steals the sheet from whoever holds it" shape
 * as linkQuoteToMaterialSheet (0042) — a sheet feeds at most one change
 * order's cost, enforced by the partial unique index (0080). Approving a
 * linked change order is what starts it tracking (see the DB trigger). */
export async function linkMaterialSheetToChangeOrder(changeOrderId: string, sheetId: string | null): Promise<void> {
  if (sheetId) {
    const { error: stealError } = await supabase
      .from("change_orders")
      .update({ material_sheet_id: null })
      .eq("material_sheet_id", sheetId)
      .neq("id", changeOrderId);
    if (stealError) throw stealError;
  }
  const { error } = await supabase.from("change_orders").update({ material_sheet_id: sheetId }).eq("id", changeOrderId);
  if (error) throw error;
}

/** Deleting a change order cascades its sections/items/images at the DB
 * level, but never touches the actual files in Storage — best-effort clean
 * those up first, same pattern as deleteQuoteSection. */
export async function deleteChangeOrder(id: string): Promise<void> {
  try {
    const { data: sections } = await supabase
      .from("change_order_sections")
      .select("id")
      .eq("change_order_id", id);
    const sectionIds = (sections ?? []).map((s) => s.id);
    if (sectionIds.length) {
      const { data: items } = await supabase.from("change_order_items").select("id").in("section_id", sectionIds);
      const itemIds = (items ?? []).map((i) => i.id);
      if (itemIds.length) {
        const { data: images } = await supabase
          .from("change_order_item_images")
          .select("storage_path")
          .in("change_order_item_id", itemIds);
        if (images?.length) {
          await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
        }
      }
    }
  } catch (err) {
    console.warn("Failed to clean up change order item images before deleting change order:", err);
  }
  const { error } = await supabase.from("change_orders").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Change order sections/items (0069) — mirrors quote_sections/quote_items
// exactly, minus is_optional (a change order has no client-picks-a-menu
// concept). `price` is signed: negative = credit/removal.
// ---------------------------------------------------------------------------

/** Change order total = every line item across every section — mirrors
 * quoteTotal(). The builder writes this to change_orders.amount on save;
 * nothing else should ever compute a change order's total independently. */
export function changeOrderTotal(sections: ChangeOrderSection[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.change_order_items ?? []) {
      total += Number(item.price) * (item.quantity == null ? 1 : Number(item.quantity));
    }
  }
  return total;
}

export async function addChangeOrderSection(
  changeOrderId: string,
  input: { name: string; sort_order?: number },
): Promise<ChangeOrderSection> {
  const { data, error } = await supabase
    .from("change_order_sections")
    .insert({ change_order_id: changeOrderId, name: input.name, sort_order: input.sort_order ?? 0 })
    .select("*, change_order_items(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateChangeOrderSection(
  id: string,
  patch: Partial<Pick<ChangeOrderSection, "name" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("change_order_sections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChangeOrderSection(id: string): Promise<void> {
  try {
    const { data: items } = await supabase.from("change_order_items").select("id").eq("section_id", id);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length) {
      const { data: images } = await supabase
        .from("change_order_item_images")
        .select("storage_path")
        .in("change_order_item_id", itemIds);
      if (images?.length) {
        await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
      }
    }
  } catch (err) {
    console.warn("Failed to clean up change order item images before deleting section:", err);
  }
  const { error } = await supabase.from("change_order_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function addChangeOrderItem(
  sectionId: string,
  input: {
    name: string;
    description?: string | null;
    price: number;
    quantity?: number;
    unit?: string | null;
    sort_order?: number;
    category_id?: string | null;
  },
): Promise<ChangeOrderItem> {
  const { data, error } = await supabase
    .from("change_order_items")
    .insert({
      section_id: sectionId,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      sort_order: input.sort_order ?? 0,
      category_id: input.category_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChangeOrderItem(
  id: string,
  patch: Partial<
    Pick<ChangeOrderItem, "name" | "description" | "price" | "quantity" | "unit" | "sort_order" | "category_id">
  >,
): Promise<void> {
  const { error } = await supabase.from("change_order_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChangeOrderItem(id: string): Promise<void> {
  try {
    const { data: images } = await supabase
      .from("change_order_item_images")
      .select("storage_path")
      .eq("change_order_item_id", id);
    if (images?.length) {
      await supabase.storage.from(IMAGES_BUCKET).remove(images.map((i) => i.storage_path));
    }
  } catch (err) {
    console.warn("Failed to clean up change order item images before deleting item:", err);
  }
  const { error } = await supabase.from("change_order_items").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadChangeOrderItemImage(
  changeOrderItemId: string,
  blob: Blob,
  sortOrder = 0,
): Promise<ChangeOrderItemImage> {
  const path = `change-order-items/${changeOrderItemId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("change_order_item_images")
    .insert({ change_order_item_id: changeOrderItemId, storage_path: path, sort_order: sortOrder })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function deleteChangeOrderItemImage(
  image: Pick<ChangeOrderItemImage, "id" | "storage_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage.from(IMAGES_BUCKET).remove([image.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("change_order_item_images").delete().eq("id", image.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Change order public share/signature (0069) — mirrors getSharedQuote/
// signSharedQuote exactly.
// ---------------------------------------------------------------------------

export interface SharedChangeOrderItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  unit: string | null;
  images: { id: string; storage_path: string }[];
}

export interface SharedChangeOrderSection {
  id: string;
  name: string;
  sort_order: number;
  items: SharedChangeOrderItem[];
}

export interface SharedChangeOrder {
  change_order: {
    id: string;
    title: string;
    description: string | null;
    reason: ChangeOrderReason | null;
    amount: number;
    status: ChangeOrderStatus;
    schedule_impact_days: number | null;
    signed_at: string | null;
    signed_by: string | null;
    created_at: string;
  };
  project: { name: string } | null;
  client: { name: string } | null;
  sections: SharedChangeOrderSection[];
}

export async function getSharedChangeOrder(token: string): Promise<SharedChangeOrder | null> {
  const { data, error } = await supabase.rpc("get_shared_change_order", { p_token: token });
  if (error) throw error;
  return (data as SharedChangeOrder | null) ?? null;
}

export async function signSharedChangeOrder(token: string, signedBy: string): Promise<void> {
  const { error } = await supabase.rpc("sign_change_order", { p_token: token, p_signed_by: signedBy });
  if (error) throw error;
}

export async function declineSharedChangeOrder(token: string, comment: string): Promise<void> {
  const { error } = await supabase.rpc("decline_shared_change_order", { p_token: token, p_comment: comment });
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
  /** Material budget tracking (0080) — which sheet line this delivery line
   * is against. Null = "Unplanned": not on any sheet, still counted in
   * actual cost, shown in its own group. Set via matchMaterialOrderItem(). */
  materials_item_id: string | null;
  /** Actual price paid, for actual cost — null falls back to the sheet
   * line's own unit_cost (see materialTracking.ts). */
  unit_price: number | null;
  /** Null = inherits the parent order's status (today's exact behavior);
   * set only to override for a partial delivery ("half the pallets
   * arrived"). */
  status: MaterialOrderStatus | null;
  /** 'manual' (today) vs 'ticket' — reserved for a future OCR'd-photo
   * source; nothing sets 'ticket' yet. */
  source: "manual" | "ticket";
  /** Reserved for a future attached scale-ticket photo. */
  ticket_photo_path: string | null;
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
  items: {
    description: string;
    quantity: number;
    unit: MaterialOrderUnit;
    materials_item_id?: string | null;
    unit_price?: number | null;
  }[];
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
        materials_item_id: item.materials_item_id ?? null,
        unit_price: item.unit_price ?? null,
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
  input: {
    description: string;
    quantity: number;
    unit: MaterialOrderUnit;
    sort_order?: number;
    materials_item_id?: string | null;
    unit_price?: number | null;
  },
): Promise<MaterialOrderItem> {
  const { data, error } = await supabase
    .from("material_order_items")
    .insert({
      material_order_id: materialOrderId,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      sort_order: input.sort_order ?? 0,
      materials_item_id: input.materials_item_id ?? null,
      unit_price: input.unit_price ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialOrderItem(
  id: string,
  patch: Partial<
    Pick<MaterialOrderItem, "description" | "quantity" | "unit" | "sort_order" | "materials_item_id" | "unit_price" | "status">
  >,
): Promise<void> {
  const { error } = await supabase.from("material_order_items").update(patch).eq("id", id);
  if (error) throw error;
}

/** Matches (or un-matches, with null) a delivery line to a sheet line —
 * the one place this happens, so the Delivery form's auto-suggest and the
 * Materials Sheet's own "Unplanned" section both go through the same
 * write. */
export async function matchMaterialOrderItem(id: string, materialsItemId: string | null): Promise<void> {
  const { error } = await supabase
    .from("material_order_items")
    .update({ materials_item_id: materialsItemId })
    .eq("id", id);
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
  | "change_order_sent"
  | "change_order_approved"
  | "change_order_rejected"
  | "quote_reverted"
  | "project_started"
  | "labor_logged";

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
  kind: "quotes" | "invoices" | "change_orders",
  id: string,
): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await supabase.from(kind).update({ share_token: token }).eq("id", id);
  if (error) throw error;
  return token;
}

export async function revokeShareLink(kind: "quotes" | "invoices" | "change_orders", id: string): Promise<void> {
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
  /** Labor Plan / Tracking (migration 0085) — prefills a labor entry's
   * hourly_rate the moment this employee is picked. Null falls back to
   * business_profile.default_labor_rate. */
  default_hourly_rate: number | null;
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
export async function updateEmployee(
  id: string,
  patch: Partial<Pick<Employee, "status" | "default_hourly_rate">>,
): Promise<void> {
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

// "call" was removed as a loggable kind (calls are no longer tracked in
// the app). Historical "call" rows are left in the DB untouched, but every
// activity/communication read below filters them out — see HIDDEN_ACTIVITY_KINDS.
export type ActivityKind =
  | "note"
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

/** Kinds that still exist as historical rows but are no longer surfaced
 * anywhere — call logging was removed; the rows are kept, just not shown. */
const HIDDEN_ACTIVITY_KINDS = ["call"];

export async function listActivities(clientId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("client_id", clientId)
    .not("kind", "in", `(${HIDDEN_ACTIVITY_KINDS.join(",")})`)
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
    .not("kind", "in", `(${HIDDEN_ACTIVITY_KINDS.join(",")})`)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

const MANUAL_COMMUNICATION_KINDS = ["note", "text", "email"] as const;

/** CRM Phase 6's "Communication Center" — every manually-logged note/
 * text/email across every customer, newest first. Reuses the
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
  | "contacted"
  | "site_visit_scheduled"
  | "site_visit_done"
  | "proposal_sent"
  | "revisions"
  | "won"
  | "lost";

export type OpportunityPriority = "low" | "normal" | "high";

export interface Opportunity {
  id: string;
  client_id: string;
  title: string;
  address: string | null;
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
  /** This opportunity's own job-type tags (migration 0079) — the live
   * source before a project exists. Once linked, project_categories (via
   * the embedded `project`) takes over and this becomes frozen history;
   * always read through opportunityCategoryIds() rather than this field
   * directly. */
  opportunity_categories?: { category_id: string }[];
  /** Read-through embed of the linked project's own category tags, purely
   * so list views (the Kanban board) can show live, current types without
   * a second query. Never write through this — use setProjectCategories. */
  project?: { project_categories?: { category_id: string }[] } | null;
}

/** The current job-type tags for an opportunity: the linked project's own
 * tags once one exists (the durable, editable-from-either-page copy), else
 * this opportunity's own pre-project tags. Never both, never merged — one
 * live source at a time, same rule the rest of the restructure follows. */
export function opportunityCategoryIds(o: Opportunity): string[] {
  if (o.project) return (o.project.project_categories ?? []).map((r) => r.category_id);
  return (o.opportunity_categories ?? []).map((r) => r.category_id);
}

const OPPORTUNITY_SELECT =
  "*, client:clients(name), opportunity_categories(category_id), project:projects(project_categories(category_id))";

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

/** Reverse lookup for the project page — "which pipeline opportunity (if
 * any) points at this project?" There's no reverse FK column on projects
 * (a project can exist with zero opportunities, e.g. a walk-in job), so
 * this is a plain query rather than an embed. Null for a standalone
 * project, or one only ever reached via getOrCreateOpportunityProject /
 * markOpportunityWon's automatic link (those still show up here too, once
 * linked — this doesn't distinguish automatic from manual). */
export async function getOpportunityByProjectId(projectId: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .eq("project_id", projectId)
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
  description?: string | null;
  lead_source?: string | null;
}): Promise<Opportunity> {
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      client_id: input.client_id,
      title: input.title,
      address: input.address ?? null,
      description: input.description ?? null,
      lead_source: input.lead_source ?? null,
    })
    .select(OPPORTUNITY_SELECT)
    .single();
  if (error) throw error;
  return data;
}

/** Replaces this opportunity's own set of job-type tags (migration 0079) —
 * only meaningful before a project exists; once one does, edit the
 * project's tags directly via setProjectCategories instead (see
 * opportunityCategoryIds' doc comment). Same delete-then-insert shape as
 * setProjectCategories. */
export async function setOpportunityCategories(opportunityId: string, categoryIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from("opportunity_categories")
    .delete()
    .eq("opportunity_id", opportunityId);
  if (delError) throw delError;
  if (categoryIds.length === 0) return;
  const { error: insError } = await supabase
    .from("opportunity_categories")
    .insert(categoryIds.map((category_id) => ({ opportunity_id: opportunityId, category_id })));
  if (insError) throw insError;
}

/**
 * project_id is deliberately NOT writable here — there are exactly two
 * legitimate ways an opportunity ever gets one: automatically, via
 * getOrCreateOpportunityProject() (lazy, on the first photo/sheet/quote)
 * or markOpportunityWon()'s own fallback to it; or manually, via
 * linkOpportunityToProject() (the opportunity page's "Link existing
 * project" action) / unlinkOpportunityProject(). Both are dedicated,
 * narrow functions rather than a widened Pick here, so the write surface
 * stays enumerable. quote_id, next_action/next_action_date, and
 * last_contact_date are gone too — quotes now live on the project (there
 * can be several), the "next step" is derived from the soonest open task,
 * and last contact is stamped automatically by an activities trigger
 * (migration 0078) whenever a call/text/email/note is logged.
 */
export async function updateOpportunity(
  id: string,
  patch: Partial<
    Pick<
      Opportunity,
      | "title"
      | "address"
      | "description"
      | "lead_source"
      | "stage"
      | "tags"
      | "measurements"
      | "lost_reason"
    >
  >,
): Promise<void> {
  // The linked project copies the opportunity's address once, when it's
  // lazily created (get_or_create_opportunity_project). Keep it following
  // later address edits too — but only while the project's own address is
  // still empty or still the opportunity's old one, so an address someone
  // set on the project directly is never overwritten.
  const before =
    patch.address !== undefined
      ? (await supabase.from("opportunities").select("address, project_id").eq("id", id).single()).data
      : null;
  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) throw error;
  if (before?.project_id && patch.address !== before.address) {
    const { data: project } = await supabase.from("projects").select("address").eq("id", before.project_id).single();
    if (project && (project.address == null || project.address === before.address)) {
      await updateProject(before.project_id, { address: patch.address ?? null });
    }
  }
}

export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw error;
}

/**
 * The Kanban board's drag handler — moves the stage AND records it in the
 * activity timeline in one call, so a stage change is never a silent
 * overwrite (section 3 of the CRM ask).
 *
 * Never call this with toStage: "won" — use markOpportunityWon() instead,
 * which runs the full Won transaction (quote lock, sibling options marked
 * not-selected, project scheduled, deposit invoice) and moves the stage
 * itself as part of it. This function alone would only move the stage.
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

// The active (non-closing) pipeline order, ranked — every "the data
// already exists" auto-advance trigger (site visit scheduled/done, quote
// sent) checks its move against this before calling moveOpportunityStage,
// so none of them can ever knock a lead backward or reopen a closed one.
// won/lost are deliberately excluded (rank -1, see autoAdvanceStage) —
// they're terminal, never part of "forward progress" comparisons.
const ACTIVE_STAGE_ORDER: OpportunityStage[] = [
  "new_lead",
  "contacted",
  "site_visit_scheduled",
  "site_visit_done",
  "proposal_sent",
  "revisions",
];

/**
 * Shared guard behind every auto-advance trigger except the one
 * deliberate exception to "never move backward" (Revisions -> Proposal
 * Sent on resend — see advanceStageOnQuoteSent, which special-cases that
 * before falling back to this). Only moves forward, and never touches an
 * opportunity that's already won/lost.
 */
async function autoAdvanceStage(
  opportunity: Pick<Opportunity, "id" | "client_id" | "stage">,
  toStage: OpportunityStage,
): Promise<void> {
  const fromRank = ACTIVE_STAGE_ORDER.indexOf(opportunity.stage);
  const toRank = ACTIVE_STAGE_ORDER.indexOf(toStage);
  if (fromRank === -1 || toRank === -1 || fromRank >= toRank) return;
  await moveOpportunityStage(opportunity, toStage);
}

/**
 * Sending a quote — first send or a revision — advances the linked
 * opportunity to Proposal Sent. This is the one place "never move
 * backward" has a deliberate exception: an opportunity sitting in
 * Revisions (client asked for changes, a revised quote is owed) moves
 * back to Proposal Sent the instant that revised quote goes out. Called
 * from QuoteWorkspace's "Send for signature" action.
 */
export async function advanceStageOnQuoteSent(
  opportunity: Pick<Opportunity, "id" | "client_id" | "stage">,
): Promise<void> {
  if (opportunity.stage === "revisions") {
    await moveOpportunityStage(opportunity, "proposal_sent");
    return;
  }
  await autoAdvanceStage(opportunity, "proposal_sent");
}

/**
 * The ONE path a project is ever created from an opportunity (migration
 * 0074's get_or_create_opportunity_project) — called the first time the
 * user does anything job-related from the opportunity page: first photo,
 * first materials sheet, first quote. Never called just for logging a
 * lead. Race-safe at the DB level (the RPC locks the opportunity row for
 * its duration), so two triggers firing at once still only ever create
 * one project — this wrapper doesn't need its own guard.
 */
export async function getOrCreateOpportunityProject(opportunityId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_opportunity_project", {
    p_opportunity_id: opportunityId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * The manual pipeline-drag Won entry point (migration 0075's
 * mark_opportunity_won) — the same transaction a client's signature
 * triggers (sign_quote/portal_approve_quote), for when the contractor
 * drags the card to Won themselves. Finds whichever quote on the
 * project is signed (if any), marks its sibling options "not selected",
 * flips the project to Scheduled, drafts a deposit invoice when there's a
 * real signed quote to size it from, and moves the opportunity's own
 * stage to Won — all in one DB transaction, so a failure anywhere never
 * leaves a half-won project. Call this INSTEAD OF moveOpportunityStage
 * when the destination stage is "won" — it handles the stage move itself.
 */
export async function markOpportunityWon(opportunityId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_opportunity_won", { p_opportunity_id: opportunityId });
  if (error) throw error;
}

/**
 * The manual counterpart to getOrCreateOpportunityProject — "this
 * opportunity and that already-existing project are the same job."
 * Callers should only offer projects from listProjectsForClient(this
 * opportunity's client_id) that aren't already linked to a different
 * opportunity; the unique partial index on opportunities.project_id
 * (migration 0074) is the actual backstop, so a race still fails loudly
 * (unique_violation) rather than silently double-linking a project.
 * Doesn't touch categories/quotes/sheets on either side — once linked,
 * opportunityCategoryIds() and the opportunity page's Estimate card
 * switch to reading the project's own data, same as the automatic path.
 */
export async function linkOpportunityToProject(opportunityId: string, projectId: string): Promise<void> {
  const { error } = await supabase.from("opportunities").update({ project_id: projectId }).eq("id", opportunityId);
  if (error) throw error;
}

/** Clears the link without deleting either record — the opportunity goes
 * back to its own pre-project data (categories, "create" actions) and the
 * project is untouched. */
export async function unlinkOpportunityProject(opportunityId: string): Promise<void> {
  const { error } = await supabase.from("opportunities").update({ project_id: null }).eq("id", opportunityId);
  if (error) throw error;
}

/**
 * Creates a quote for this opportunity's job — lazily creating the
 * project first if this is the first job-related thing done from the
 * opportunity page (see getOrCreateOpportunityProject). The quote is
 * always project-linked, never standalone, so multiple quote options
 * (e.g. basic patio vs. patio + fire pit) all live on the same project
 * and show up together in ProjectQuotesView / the project's Estimate
 * card. Creating a quote is not itself a pipeline trigger (only *sending*
 * one is, via advanceStageOnQuoteSent) — stage is left untouched here.
 */
export async function createQuoteFromOpportunity(
  opportunity: Pick<Opportunity, "id" | "client_id" | "title">,
): Promise<Quote> {
  const projectId = await getOrCreateOpportunityProject(opportunity.id);
  const quote = await createQuote({ client_id: opportunity.client_id, project_id: projectId });
  await logActivity(opportunity.client_id, "quote_created", "Quote created from opportunity", {
    opportunity_id: opportunity.id,
    quote_id: quote.id,
  });
  return quote;
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

/** Task types offered when creating a task. "call" stays in TaskType (and
 * TASK_TYPE_LABEL) only so historical call tasks still render a label —
 * call-related features were removed, so no new ones can be created. */
export const CREATABLE_TASK_TYPES: TaskType[] = [
  "text",
  "email",
  "site_visit",
  "prepare_estimate",
  "send_proposal",
  "follow_up",
  "collect_deposit",
  "schedule_project",
  "general_task",
];

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
  /** Date-only appointment (0092) — date_time is local noon of the date and
   * carries no meaningful time; show it as "All day". Older appointments
   * (false) keep their real time. */
  all_day: boolean;
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

/** Appointment types that count as the site visit for the CRM stage rules
 * (Site Visit Scheduled on schedule, back to Contacted on cancel, Site Visit
 * Done on completion). */
export const SITE_VISIT_APPOINTMENT_TYPES: AppointmentType[] = ["site_visit", "estimate_appointment"];

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
  all_day?: boolean;
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
      all_day: input.all_day ?? false,
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
  // CRM auto-advance: scheduling a site visit / estimate appointment for a
  // lead moves it to Site Visit Scheduled (see autoAdvanceStage — never
  // backward, never a closed lead).
  if (SITE_VISIT_APPOINTMENT_TYPES.includes(input.type ?? "site_visit") && input.opportunity_id) {
    const opportunity = await getOpportunity(input.opportunity_id);
    await autoAdvanceStage(opportunity, "site_visit_scheduled");
  }
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
  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .select("opportunity_id, type, status")
    .single();
  if (error) throw error;
  if (!data.opportunity_id || !SITE_VISIT_APPOINTMENT_TYPES.includes(data.type)) return;
  // CRM auto-advance, same rules as createAppointment: an edit that leaves
  // a scheduled site visit (type changed to site visit, or a completed one
  // unchecked back to scheduled) moves the lead forward to Site Visit
  // Scheduled — never backward, never a closed lead.
  if (data.status === "scheduled") {
    // Unchecking a completed visit (the only thing that sets status back to
    // scheduled) first undoes the Site Visit Done advance, if nothing else
    // justifies it.
    if (patch.status === "scheduled") await revertSiteVisitStage(data.opportunity_id, "site_visit_done", "completed");
    await autoAdvanceStage(await getOpportunity(data.opportunity_id), "site_visit_scheduled");
  } else if (patch.status === "cancelled") {
    await revertSiteVisitStage(data.opportunity_id, "site_visit_scheduled", "scheduled");
  }
}

/**
 * Undoes a site-visit auto-advance one step, only if the opportunity is
 * still sitting at the stage that advance put it in and no other site visit
 * / estimate appointment on it still justifies that stage:
 * - cancelled visit: Site Visit Scheduled → Contacted, unless another visit
 *   is still `scheduled` (an overdue, still-scheduled one counts — it may
 *   well have happened and just not been checked off yet);
 * - unchecked completion: Site Visit Done → Site Visit Scheduled, unless
 *   another visit is still `completed`.
 * Any other stage (the lead was moved on, or never got here) is left alone.
 */
async function revertSiteVisitStage(
  opportunityId: string,
  fromStage: "site_visit_scheduled" | "site_visit_done",
  keepIfAnyStatus: AppointmentStatus,
): Promise<void> {
  const opportunity = await getOpportunity(opportunityId);
  if (opportunity.stage !== fromStage) return;
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("opportunity_id", opportunityId)
    .in("type", SITE_VISIT_APPOINTMENT_TYPES)
    .eq("status", keepIfAnyStatus);
  if (error) throw error;
  if (!count) await moveOpportunityStage(opportunity, fromStage === "site_visit_done" ? "site_visit_scheduled" : "contacted");
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
    // CRM auto-advance: completing a site visit moves the lead to Site
    // Visit Done (same forward-only guard as scheduling it).
    if (SITE_VISIT_APPOINTMENT_TYPES.includes(appointment.type) && appointment.opportunity_id) {
      const opportunity = await getOpportunity(appointment.opportunity_id);
      await autoAdvanceStage(opportunity, "site_visit_done");
    }
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

// ---------------------------------------------------------------------------
// Project measurements (0091) — grouped per build type; the field config
// lives in src/lib/measurements.ts, this is just storage.
// ---------------------------------------------------------------------------

export async function listProjectMeasurements(projectId: string): Promise<MeasurementRow[]> {
  const { data, error } = await supabase
    .from("project_measurements")
    .select("id, project_id, build_type, category_id, field_key, label, value, value_text, unit, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({ ...r, value: r.value == null ? null : Number(r.value) }));
}

/** Applies a Measurements card draft: upserts `rows` (ids are client-
 * generated for new rows) and deletes `deleteIds`. Also writes the total
 * area back into projects.size_sqft (see totalAreaSqft) so the Labor page
 * keeps reading one number. */
export async function saveProjectMeasurements(
  projectId: string,
  rows: MeasurementRow[],
  deleteIds: string[],
  sizeSqft: number | null,
): Promise<void> {
  if (deleteIds.length > 0) {
    const { error } = await supabase.from("project_measurements").delete().in("id", deleteIds);
    if (error) throw error;
  }
  if (rows.length > 0) {
    const { error } = await supabase
      .from("project_measurements")
      .upsert(rows.map((r) => ({ ...r, project_id: projectId })));
    if (error) throw error;
  }
  await updateProject(projectId, { size_sqft: sizeSqft });
}

// ---------------------------------------------------------------------------
// Cost Plan (0085) — the project's predicted job cost. Materials and Labor
// are never stored here (see the migration's header comment) — this table
// only ever holds the three manual groups. See src/lib/costPlan.ts for the
// pure math that rolls this up alongside the live Materials/Labor figures
// into one Cost Plan summary.
// ---------------------------------------------------------------------------

export type CostPlanGroup = "subcontractor" | "equipment" | "other";

export interface CostPlanItem {
  id: string;
  project_id: string;
  group: CostPlanGroup;
  name: string;
  planned_cost: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function listCostPlanItems(projectId: string): Promise<CostPlanItem[]> {
  const { data, error } = await supabase
    .from("cost_plan_items")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((row) => ({ ...row, group: row.group as CostPlanGroup }));
}

export async function createCostPlanItem(input: {
  project_id: string;
  group: CostPlanGroup;
  name: string;
  planned_cost: number;
}): Promise<CostPlanItem> {
  const { data, error } = await supabase
    .from("cost_plan_items")
    .insert({
      project_id: input.project_id,
      group: input.group,
      name: input.name,
      planned_cost: input.planned_cost,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...data, group: data.group as CostPlanGroup };
}

export async function updateCostPlanItem(
  id: string,
  patch: Partial<Pick<CostPlanItem, "name" | "planned_cost">>,
): Promise<void> {
  const { error } = await supabase.from("cost_plan_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCostPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from("cost_plan_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Labor Plan + Labor Tracking (0085) — planned hours/cost per job category
// ("scope"), and the actual hours logged against it once the job runs. See
// src/lib/laborPlan.ts for the planned-vs-actual and productivity math.
// ---------------------------------------------------------------------------

/** One row per (project, scope) — category_id null = "General" (whole-job
 * labor not tied to a single job category). planned_hours/hourly_rate are
 * optional helpers; planned_cost is always the number every other screen
 * reads (see the migration's header comment). */
export interface LaborPlanEntry {
  id: string;
  project_id: string;
  category_id: string | null;
  planned_hours: number | null;
  hourly_rate: number | null;
  planned_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function listLaborPlanEntries(projectId: string): Promise<LaborPlanEntry[]> {
  const { data, error } = await supabase
    .from("labor_plan_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

/** At most one plan row per scope per project (see the migration's unique
 * indexes) — select-then-write rather than a DB-level upsert so this works
 * uniformly whether category_id is a real id or null ("General"), which
 * `.upsert()`'s single-column conflict target can't express cleanly. A
 * planned_hours/hourly_rate/planned_cost of 0 with empty notes still
 * writes an explicit zero row (the caller — the Labor Plan draft save —
 * decides whether a blank row is worth persisting at all). */
export async function upsertLaborPlanEntry(input: {
  project_id: string;
  category_id: string | null;
  planned_hours: number | null;
  hourly_rate: number | null;
  planned_cost: number;
  notes: string | null;
}): Promise<LaborPlanEntry> {
  let existing = supabase
    .from("labor_plan_entries")
    .select("id")
    .eq("project_id", input.project_id);
  existing = input.category_id ? existing.eq("category_id", input.category_id) : existing.is("category_id", null);
  const { data: existingRow, error: findError } = await existing.maybeSingle();
  if (findError) throw findError;

  const values = {
    planned_hours: input.planned_hours,
    hourly_rate: input.hourly_rate,
    planned_cost: input.planned_cost,
    notes: input.notes,
  };

  if (existingRow) {
    const { data, error } = await supabase
      .from("labor_plan_entries")
      .update(values)
      .eq("id", existingRow.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("labor_plan_entries")
    .insert({ project_id: input.project_id, category_id: input.category_id, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLaborPlanEntry(id: string): Promise<void> {
  const { error } = await supabase.from("labor_plan_entries").delete().eq("id", id);
  if (error) throw error;
}

/** Actual labor logged in the field. `employee_id` links a real
 * Employee-Only Mode login; `worker_name` is free text for a crew member
 * who isn't one (or a snapshot if the employee is later removed) — same
 * "denormalized text, not a hard FK" shape as Suppliers / usage logs'
 * logged_by. */
export interface LaborEntry {
  id: string;
  project_id: string;
  category_id: string | null;
  employee_id: string | null;
  worker_name: string | null;
  entry_date: string;
  hours: number;
  hourly_rate: number | null;
  cost: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function listLaborEntries(projectId: string): Promise<LaborEntry[]> {
  const { data, error } = await supabase
    .from("labor_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createLaborEntry(input: {
  project_id: string;
  category_id: string | null;
  employee_id: string | null;
  worker_name: string | null;
  entry_date: string;
  hours: number;
  hourly_rate: number | null;
  cost: number;
  note?: string | null;
}): Promise<LaborEntry> {
  const { data, error } = await supabase
    .from("labor_entries")
    .insert({
      project_id: input.project_id,
      category_id: input.category_id,
      employee_id: input.employee_id,
      worker_name: input.worker_name,
      entry_date: input.entry_date,
      hours: input.hours,
      hourly_rate: input.hourly_rate,
      cost: input.cost,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLaborEntry(
  id: string,
  patch: Partial<Pick<LaborEntry, "category_id" | "employee_id" | "worker_name" | "entry_date" | "hours" | "hourly_rate" | "cost" | "note">>,
): Promise<void> {
  const { error } = await supabase.from("labor_entries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteLaborEntry(id: string): Promise<void> {
  const { error } = await supabase.from("labor_entries").delete().eq("id", id);
  if (error) throw error;
}
