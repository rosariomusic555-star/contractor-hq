import { depositAmount as depositAmountOf } from "./projectMoney";
import { supabase } from "./supabase";
import { materialsLineTotal } from "./materialsMath";
import { compressImageFile, randomImageFilename } from "./imageUpload";
import { customMeasurementPayload, featureMeasurementPayload, type FeatureInstance, type MeasurementRow } from "./measurements";
import type { TypeConfig } from "./typeConfig";
import type { FeatureSectionSeed } from "./sectionFeatures";
import type { CostBucket, LaborMode, LineCostType } from "./costPlanMath";
import type { FeatureStatus, ProjectFeature } from "./features";
import type { CostChangeKind } from "./changeOrderCost";
import { OVERHEAD_SETTINGS_DEFAULTS, burdenPerHour, type OverheadSettings } from "./overhead";
import { LUMP_SUM_UNIT } from "./costPlanMath";
import { clientSafeProjectDetail, clientSharedChangeOrder, clientSharedInvoice, clientSharedQuote, clientSharedReceipt } from "./clientSafe";
import type { PortalProjectDetail } from "./portalApi";
import { groupCost, groupFromRows, sectionIncluded, selectionsTotal } from "./selections";
import { appointmentWhenLabel, compareAppointments } from "./appointmentTime";

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
  /** Review requests (0122) — "Don't ask for reviews". */
  no_review_requests?: boolean;
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
  /** 0128 — false for free sources (Referral, Walk-in, …): no spend math. */
  paid?: boolean;
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
  /** Only where the select asks for it (INVOICE_SELECT). */
  client_id?: string | null;
  client: ClientRef | null;
}

export interface Project {
  id: string;
  user_id: string;
  /** 0122 — set when the project becomes Complete. */
  completed_at?: string | null;
  /** 0127 — "No maintenance reminders" for this job. */
  maintenance_dismissed?: boolean;
  /** Structured job context (0114) — comparable across jobs. */
  job_slope?: "flat" | "slight" | "moderate" | "steep" | null;
  job_access?: "easy" | "tight" | "difficult" | null;
  job_soil?: "normal" | "clay" | "rocky" | "wet" | null;
  job_demo?: "none" | "light" | "heavy" | null;
  /** The overhead burden ($/man-hour) and target margin it was sold with —
   * copied from the signed quote (0110). Actual fully loaded profit uses it. */
  overhead_rate?: number | null;
  target_margin_pct?: number | null;
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
  /** Real crews (0120) — which crew works this job; the rain-delay
   * cascade shifts only the same crew's jobs. Names via listCrews(). */
  crew_id?: string | null;
  /** Crew work order (0125) — contractor-side fields. */
  crew_notes?: string | null;
  crew_client_notes?: string | null;
  crew_note_photos?: string[];
  crew_hide_client_phone?: boolean;
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
  opportunities?: { id: string; stage: OpportunityStage; source_project_id?: string | null }[];
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
  /** Progress updates (0126): the full-size original (contractor only), the
   * update it belongs to, and Before / After for a feature. */
  original_path?: string | null;
  progress_update_id?: string | null;
  ba_role?: "before" | "after" | null;
  ba_feature_id?: string | null;
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
  /** Set on the line a section's Quick Quote produced (0102) — the build
   * type it was quoted as. Re-running Quick Quote on the section updates
   * this line in place. Null = an ordinary line; undefined before 0102. */
  quick_quote_build_type?: string | null;
  quote_item_images: QuoteItemImage[];
}

export type QuoteSectionMaterialsLinkMode = "auto" | "manual";

export interface QuoteSection {
  id: string;
  quote_id: string;
  name: string;
  is_optional: boolean;
  sort_order: number;
  /** Project-type tag (0095) — same list/chip as materials sheet sections.
   * Drives auto-matching to the materials sheet. Undefined before 0095. */
  job_category_id?: string | null;
  /** 'auto' = matched live to the quote's materials sheet sections (see
   * src/lib/quoteSectionMaterials.ts); 'manual' = quote_section_material_links. */
  materials_link_mode?: QuoteSectionMaterialsLinkMode;
  /** The project feature this section prices (0105). Null on standalone
   * quotes and on a section that isn't a feature. */
  feature_id?: string | null;
  /** Manual picks (0095) — only on getQuote()'s read. */
  quote_section_material_links?: { materials_section_id: string }[];
  quote_items: QuoteItem[];
  /** Client Selections (0115) — choice groups on this section. */
  quote_selection_groups?: QuoteSelectionGroup[];
}

export interface QuoteSelectionOption {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  catalog_product_id: string | null;
  color: string | null;
  price_delta: number;
  /** Internal only. */
  cost_delta: number;
  /** Internal only — the Cost plan line this option changes, and what it
   * sets on it. */
  link_item_id: string | null;
  link_set: { catalog_product_id?: string | null; color?: string | null; unit_cost?: number | null; name?: string | null };
  is_default: boolean;
  sort_order: number;
}

export interface QuoteSelectionPick {
  id: string;
  group_id: string;
  option_id: string;
  picked_by: "client" | "contractor" | "default" | "change_order";
  picked_at: string;
}

export interface QuoteSelectionGroup {
  id: string;
  quote_section_id: string;
  name: string;
  help_text: string | null;
  required: boolean;
  multi: boolean;
  sort_order: number;
  approved_price: number | null;
  approved_at: string | null;
  quote_selection_options?: QuoteSelectionOption[];
  quote_selection_picks?: QuoteSelectionPick[];
}

/** Manual quote section → materials sheet section picks (0095). */
export async function listQuoteSectionMaterialLinks(
  quoteSectionIds: string[],
): Promise<{ quote_section_id: string; materials_section_id: string }[]> {
  if (quoteSectionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("quote_section_material_links")
    .select("quote_section_id, materials_section_id")
    .in("quote_section_id", quoteSectionIds);
  if (error) {
    if (error.code === "PGRST205") return []; // 0095 not run yet
    throw error;
  }
  return data ?? [];
}

/** Replaces one quote section's manual picks. */
export async function setQuoteSectionMaterialLinks(quoteSectionId: string, materialsSectionIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from("quote_section_material_links")
    .delete()
    .eq("quote_section_id", quoteSectionId);
  if (delError) throw delError;
  if (materialsSectionIds.length === 0) return;
  const { error } = await supabase
    .from("quote_section_material_links")
    .insert(materialsSectionIds.map((materials_section_id) => ({ quote_section_id: quoteSectionId, materials_section_id })));
  if (error) throw error;
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
  /** 'original' (the job's quote, and its revisions) or 'addon' (0108) — new
   * features added to a Won job. An add-on never replaces the original; its
   * approval adds to the contract. Undefined before 0108 = original. */
  /** The overhead burden ($/man-hour) and target margin this quote is
   * priced with (0110) — refreshable while draft, frozen once sent. */
  overhead_rate?: number | null;
  target_margin_pct?: number | null;
  kind?: "original" | "addon";
  /** Quote activity (0117) — client engagement rollups, internal only. */
  sent_at?: string | null;
  view_count?: number;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  last_view_device?: "mobile" | "tablet" | "desktop" | null;
  last_activity_at?: string | null;
  selections_changed_at?: string | null;
  status: QuoteStatus;
  deposit_percentage: number;
  notes: string | null;
  terms: string | null;
  share_token: string | null;
  signed_at: string | null;
  signed_by: string | null;
  /** Contractor-side approval (0133): who recorded it, how the client agreed. Null = the client approved. */
  approved_manually_by?: string | null;
  approval_method?: "in_person" | "paper" | "other" | null;
  approval_note?: string | null;
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
  /** Σ ACTIVE payment allocations (0111) — trigger-maintained, drives
   * "Partially paid" / balance. status 'paid' ⇔ amount_paid ≥ amount. */
  amount_paid?: number;
  // Display number ("INV-001", …), set once at creation from the count of
  // invoices already on the project. Frozen — doesn't shift if an earlier
  // invoice is later deleted.
  invoice_number: string | null;
  /** First time the client opened the share link (0097) — the timeline's
   * "Viewed" step. Null until then (and before 0097). */
  viewed_at?: string | null;
  created_at: string;
  updated_at: string;
  project?: ProjectRef | null;
}

/** An invoice's own line item (0097). */
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return []; // 0097 not run yet
    throw error;
  }
  return data ?? [];
}

/**
 * Replaces an invoice's line items and, when there are any, writes their
 * sum to invoices.amount — so every total/revenue/aging reader (which all
 * read `amount`) stays correct with no changes. With no lines the invoice
 * keeps its own hand-entered amount (`fallbackAmount`).
 */
export async function saveInvoiceItems(
  invoiceId: string,
  items: { description: string; quantity: number; unit_price: number }[],
  fallbackAmount: number,
): Promise<void> {
  // New lines first, then remove the old ones — a failed insert leaves the
  // invoice's existing lines untouched instead of deleting them.
  const { data: old, error: listError } = await supabase.from("invoice_items").select("id").eq("invoice_id", invoiceId);
  if (listError && listError.code !== "PGRST205") throw listError;
  if (items.length > 0) {
    const { error } = await supabase.from("invoice_items").insert(
      items.map((it, i) => ({
        invoice_id: invoiceId,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        sort_order: i,
      })),
    );
    if (error) throw error;
  }
  const oldIds = (old ?? []).map((r) => r.id);
  if (oldIds.length > 0) {
    const { error: delError } = await supabase.from("invoice_items").delete().in("id", oldIds);
    if (delError) throw delError;
  }
  const amount = items.length > 0 ? invoiceItemsTotal(items) : fallbackAmount;
  await updateInvoice(invoiceId, { amount: Math.round(amount * 100) / 100 });
}

export const invoiceItemsTotal = (items: { quantity: number; unit_price: number }[]) =>
  items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

/** Stamps the first client view of a shared invoice (0097). Best-effort —
 * a failure (e.g. before the migration) never affects the page. */
export async function markInvoiceViewed(token: string): Promise<void> {
  const { error } = await supabase.rpc("mark_invoice_viewed", { p_token: token });
  if (error) console.warn("mark_invoice_viewed failed", error.message);
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
  /** Which cost-plan bucket this category's spend counts toward (0103) —
   * defaulted from the name, editable in Settings. Null/undefined before
   * 0103 reads as material. */
  cost_type?: CostBucket | null;
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
/** A contractor's own material category (0094) — Settings > Material
 * categories. The single category on a materials sheet line; groups the
 * Order Sheet. Seeded with DEFAULT_MATERIAL_CATEGORIES. */
export interface MaterialCategory {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  /** 0162 — lines in this category ask for a color (hardscape). Undefined
   * before 0162 reads as false. */
  needs_color?: boolean;
  created_at: string;
}

export async function listMaterialCategories(): Promise<MaterialCategory[]> {
  const { data, error } = await supabase.from("material_categories").select("*").order("sort_order").order("name");
  if (error) {
    // PGRST205 = migration 0094 not run yet — degrade to empty.
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return data ?? [];
}

export async function createMaterialCategory(input: { name: string; sort_order?: number }): Promise<MaterialCategory> {
  const { data, error } = await supabase
    .from("material_categories")
    .insert({ name: input.name, sort_order: input.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialCategory(
  id: string,
  patch: Partial<Pick<MaterialCategory, "name" | "sort_order" | "needs_color">>,
): Promise<void> {
  const { error } = await supabase.from("material_categories").update(patch).eq("id", id);
  if (error) throw error;
}

/** Lines using it fall back to Uncategorized (FK on delete set null). */
export async function deleteMaterialCategory(id: string): Promise<void> {
  const { error } = await supabase.from("material_categories").delete().eq("id", id);
  if (error) throw error;
}

/** Colors already used on this contractor's lines, by item name (lower-
 * cased, trimmed) — suggestions for a typed / Price Book line's Color
 * field (0162). */
export async function listUsedColors(): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("materials_items")
    .select("name, color")
    .not("color", "is", null)
    .limit(2000);
  const out = new Map<string, string[]>();
  if (error) return out;
  for (const row of (data ?? []) as { name: string; color: string | null }[]) {
    const color = row.color?.trim();
    const key = row.name?.trim().toLowerCase();
    if (!color || !key) continue;
    const list = out.get(key) ?? [];
    if (!list.some((c) => c.toLowerCase() === color.toLowerCase())) list.push(color);
    out.set(key, list);
  }
  return out;
}

/** Name → the contractor's category id (case-insensitive) — how a Catalog
 * product / Price Book item's text category prefills a line's category. */
export function materialCategoryIdByName(categories: MaterialCategory[], name: string | null | undefined): string | null {
  const key = name?.trim().toLowerCase();
  if (!key) return null;
  return categories.find((c) => c.name.toLowerCase() === key)?.id ?? null;
}

/** The original fixed list — now only the seed for material_categories
 * (0094) and the Price Book's fallback options before 0094 runs. */
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
  /** Cost plan line type (0103): material (default — every line before
   * 0103), subcontractor, equipment, other. Only material lines have
   * waste %, Catalog, tracking and the order sheet. Undefined before 0103
   * reads as material. */
  cost_type?: LineCostType;
  /** Vendor / sub name for a non-material line (0103). */
  vendor?: string | null;
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
  /** The line's one category (0094) — Settings > Material categories.
   * Null = Uncategorized. Supersedes the old text `category` (kept as a
   * name snapshot, written alongside) and the old cost category
   * `expense_category_id` (no longer shown; data kept). */
  material_category_id?: string | null;
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
  /** "Looks like overhead" dismissed for this line (0110). */
  overhead_warning_dismissed?: boolean;
  /** 0160 — added from this possible sub ("Add as subcontractor line"). */
  possible_sub_id?: string | null;
  /** 0162 — optional description (specs, notes). Internal: crew work order
   * and order sheet, never clients. Undefined before 0162. */
  internal_description?: string | null;
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

/** A Cost plan section's labor block columns (0103). */
export interface SectionLaborFields {
  labor_mode: LaborMode | null;
  labor_crew_size: number | null;
  labor_days: number | null;
  labor_hours_per_day: number | null;
  labor_rate: number | null;
  labor_lump_sum: number | null;
  labor_notes: string | null;
  /** hours mode's man-hours / a lump sum's optional man-hours (0110). */
  labor_man_hours?: number | null;
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
  /** Project-type tag (0094) — one of the project's own Job Categories
   * (Settings > Categories). Null = untagged. Undefined before 0094. */
  job_category_id?: string | null;
  /** The cost plan's one project-wide section (0103) — pinned last, can't
   * be deleted. */
  is_general?: boolean;
  /** The project feature this section plans (0105). Null = General. */
  feature_id?: string | null;
  /** Read-through of the feature's status (listMaterials*) — a proposed or
   * removed feature's section never counts toward project totals. */
  feature?: { status: FeatureStatus; source_quote_id: string | null } | null;
  /** Labor block (0103) — see costPlanMath.sectionLaborCost. Null mode =
   * no labor planned. */
  labor_mode?: LaborMode | null;
  labor_crew_size?: number | null;
  labor_days?: number | null;
  labor_hours_per_day?: number | null;
  labor_rate?: number | null;
  labor_lump_sum?: number | null;
  labor_notes?: string | null;
  labor_man_hours?: number | null;
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
  /** Project types this sheet has accounted for (0100): present when it was
   * created (with or without a section), or added/dismissed from the "was
   * added to this project" banner since. Undefined before 0100 — no banner. */
  feature_category_ids?: string[];
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

/** Every usage log the account can see (RLS) — for cross-project reports
 * (Revenue), without a huge `in (…ids)` list. */
export async function listAllUsageLogs(): Promise<MaterialsUsageLog[]> {
  const { data, error } = await supabase.from("materials_usage_logs").select("*");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
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
/** Compresses and uploads an expense's receipt photo (0151) — keyed by
 * project, since a receipt is often scanned before its expense exists.
 * Returns the path to save as expenses.receipt_path. */
export async function uploadExpenseReceipt(projectId: string, file: File): Promise<string> {
  const compressed = await compressImageFile(file);
  const path = `expense-receipts/${projectId}/${randomImageFilename(file.name)}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

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
  /** Split lines (0096) — two or more = a split expense; category rollups
   * use these (see expenseCategoryAllocations). Empty/undefined = a normal,
   * single-category expense. */
  expense_lines?: ExpenseLine[];
  /** The project feature this spend is for (0105) — null = General. */
  feature_id?: string | null;
  /** Its cost type (0109) — null = follow the expense category's type. */
  cost_type?: CostBucket | null;
  /** Who it was paid to (0151). */
  vendor?: string | null;
  /** Internal note (0151). */
  notes?: string | null;
  /** Receipt photo in the images bucket, expense-receipts/<project>/… (0151). */
  receipt_path?: string | null;
}

export interface ExpenseLine {
  id: string;
  expense_id: string;
  expense_category_id: string | null;
  amount: number;
  description: string | null;
  sort_order: number;
  /** Per split line: feature (0105) and cost type (0109), as on Expense. */
  feature_id?: string | null;
  cost_type?: CostBucket | null;
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
  /** Contractor-recorded approval (0139) — who recorded it; null = the client approved. */
  approved_manually_by?: string | null;
  approval_method?: "in_person" | "paper" | "other" | null;
  approval_note?: string | null;
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
  /** The existing, active project feature this section changes (0107). */
  feature_id?: string | null;
  /** The scope / measurement change, e.g. "+100 sq ft" (0107). */
  scope_note?: string | null;
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
    // Client Selections (0115): each group's chosen (or default) option
    // prices, only on an included section — same as SQL quote_committed_total.
    if (section.quote_selection_groups?.length && sectionIncluded(section)) {
      total += selectionsTotal(section.quote_selection_groups.map(groupFromRows));
    }
  }
  return total;
}

/** Client Selections' internal cost on a quote that isn't approved yet: the
 * picked (else default) options' cost adjustments on included sections. The
 * Cost plan only gets them — as "Selection:" lines, 0116/0148 — when the
 * quote is approved, while quoteTotal() already counts their price; screens
 * that compare the quote's price with the Cost plan add this so the margin
 * reads the same before and after approval. 0 once approved. */
export function pendingSelectionsCost(quote: Pick<Quote, "status" | "quote_sections"> | undefined): number {
  if (!quote || quote.status === "approved") return 0;
  let cost = 0;
  for (const section of quote.quote_sections ?? []) {
    if (!section.quote_selection_groups?.length || !sectionIncluded(section)) continue;
    cost += section.quote_selection_groups.map(groupFromRows).reduce((s, g) => s + groupCost(g), 0);
  }
  return cost;
}

/**
 * Which quote represents "the" quote for a project when there can be many:
 * the most recently approved one; failing that, the most recently sent one;
 * failing that, the most recent draft. Used by the Profit Summary card and
 * the Quotes hub-card summary so both agree on the same headline quote.
 */
export function pickHeadlineQuote(quotes: Quote[]): Quote | undefined {
  const byRecency = (a: Quote, b: Quote) => b.created_at.localeCompare(a.created_at);
  // Add-on quotes (0108) are never "the" quote — they add to it.
  const originals = quotes.filter((q) => (q.kind ?? "original") === "original");
  const mostRecentWithStatus = (status: QuoteStatus) =>
    originals.filter((q) => q.status === status).sort(byRecency)[0];
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
 * A project's contract value = its headline quote's total, plus approved
 * add-on quotes (0108), plus its
 * approved change orders. This is the single source of truth for
 * "contract value" — nothing stores it; every screen that shows a
 * project's contract (ProjectDetailView, ProjectsView, invoicing) derives
 * it live from this same function so there's never a second number to
 * drift out of sync.
 */
export function projectContractValue(quotes: Quote[], changeOrders: ChangeOrder[]): number {
  const headline = pickHeadlineQuote(quotes);
  const base = headline ? quoteTotal(headline.quote_sections) : 0;
  return base + approvedAddonQuoteTotal(quotes) + approvedChangeOrderTotal(changeOrders);
}

/** Approved add-on quotes (0108) — new features added to a Won job. Each
 * one adds to the contract, like an approved change order. */
export function approvedAddonQuoteTotal(quotes: Quote[]): number {
  return quotes
    .filter((q) => q.kind === "addon" && q.status === "approved")
    .reduce((sum, q) => sum + quoteTotal(q.quote_sections), 0);
}

/** Won means signed (see the Pipeline's stage meanings) — deposit is
 * tracked separately, here, not as part of the pipeline. A project's
 * deposit counts as received once payments received (0111) cover the headline
 * quote's deposit (headlineDepositDue); there's no dedicated
 * "deposit invoice" concept in the schema, so this is derived, live, from
 * the same figures every other money screen already shows (no second
 * calculation path) — never a stored flag, so it clears the moment enough
 * gets paid, with no extra bookkeeping. Only flags true once
 * DEPOSIT_GRACE_DAYS have passed since signing, so a job that signed
 * yesterday doesn't immediately read as overdue. */
export const DEPOSIT_GRACE_DAYS = 3;

/** The deposit a job asks for — the signed quote's deposit % of that quote's
 * total (cents, 0–100%), the same rule as the deposit invoice
 * (createProjectInvoice). Never a % of the whole contract: approved change
 * orders and add-ons (which draft their own deposit) don't raise it. */
export function headlineDepositDue(headlineQuote: Pick<Quote, "quote_sections" | "deposit_percentage"> | null | undefined): number {
  return headlineQuote ? depositAmountOf(quoteTotal(headlineQuote.quote_sections), headlineQuote.deposit_percentage) : 0;
}

export function isDepositOverdue(headlineQuote: Quote | undefined, paidTotal: number, now: Date = new Date()): boolean {
  if (!headlineQuote?.signed_at) return false;
  const daysSinceSigned = (now.getTime() - new Date(headlineQuote.signed_at).getTime()) / 86_400_000;
  if (daysSinceSigned < DEPOSIT_GRACE_DAYS) return false;
  const due = headlineDepositDue(headlineQuote);
  if (due <= 0) return false;
  return paidTotal + 0.005 < due;
}


/** A customer's realized revenue — every active payment received (0111),
 * same "collected" rule as everywhere else in the app. */
export function clientLifetimeRevenue(payments: Pick<Payment, "status" | "amount">[]): number {
  return payments.filter((p) => p.status !== "void").reduce((sum, p) => sum + Number(p.amount), 0);
}

/** What a customer still owes on issued invoices — sent/overdue balances
 * after applied payments; a draft hasn't been issued, so it isn't owed. */
export function clientOutstandingBalance(invoices: Invoice[]): number {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + Math.max(0, Number(i.amount) - Number(i.amount_paid ?? 0)), 0);
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
  preferred_contact_method?: PreferredContactMethod | null;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      lead_source: input.lead_source || null,
      // Only sent when chosen (it was silently dropped on create before).
      ...(input.preferred_contact_method ? { preferred_contact_method: input.preferred_contact_method } : {}),
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
// Custom project type setups (0159) — see src/lib/typeConfig.ts.
// ---------------------------------------------------------------------------

const TYPE_CONFIG_COLS = "category_id, based_on, fields, summary_keys, line_items, tunables, quick_quote";

export async function listTypeConfigs(): Promise<TypeConfig[]> {
  const { data, error } = await supabase.from("project_type_configs").select(TYPE_CONFIG_COLS);
  // Before 0159: no setups.
  if (error) return [];
  return (data ?? []) as TypeConfig[];
}

export async function saveTypeConfig(config: TypeConfig): Promise<void> {
  const { error } = await supabase.from("project_type_configs").upsert(
    {
      category_id: config.category_id,
      based_on: config.based_on ?? null,
      fields: config.fields,
      summary_keys: config.summary_keys,
      line_items: config.line_items,
      tunables: config.tunables,
      quick_quote: config.quick_quote ?? null,
    },
    { onConflict: "category_id", defaultToNull: false },
  );
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") throw new Error("Run migration 0159 to save project type setups.");
    throw error;
  }
}

export async function deleteTypeConfig(categoryId: string): Promise<void> {
  const { error } = await supabase.from("project_type_configs").delete().eq("category_id", categoryId);
  if (error) throw error;
}

/** Where a project type is used (0156) — the delete warning's counts. */
export type CategoryUsage = Record<
  | "opportunities"
  | "projects"
  | "features"
  | "quote_lines"
  | "quote_sections"
  | "cost_plan_sections"
  | "change_order_lines"
  | "labor_entries"
  | "measurements",
  number
>;

export async function getCategoryUsage(id: string): Promise<CategoryUsage | null> {
  const { data, error } = await supabase.rpc("category_usage", { p_category_id: id });
  // Before 0156: no counts — the dialog falls back to a plain warning.
  if (error) return null;
  return data as CategoryUsage;
}

/** Moves every reference from one project type to another (0156), so the
 * old one can be deleted without losing anything. */
export async function reassignCategory(fromId: string, toId: string): Promise<void> {
  const { error } = await supabase.rpc("reassign_category", { p_from: fromId, p_to: toId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("Run migration 0156 to move a project type's records to another type.");
    throw error;
  }
}

/** Saves a new project type order (0..n-1), only the rows that moved. */
export async function reorderCategories(ordered: Pick<Category, "id" | "sort_order">[]): Promise<void> {
  await Promise.all(ordered.map((c, i) => (c.sort_order === i ? null : updateCategory(c.id, { sort_order: i }))));
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
  patch: Partial<Pick<LeadSource, "name" | "sort_order" | "paid">>,
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

// The opportunities embed names its FK: opportunities also carries
// source_project_id (0127), and two FKs between the tables make an unhinted
// embed ambiguous (PGRST201) — see 0129.
const PROJECT_SELECT =
  "*, client:clients(name, email, phone, address), project_categories(category_id), opportunities!opportunities_project_id_fkey(id, stage, source_project_id)";

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
      | "crew_id"
      | "estimated_duration_days"
      | "actual_start_date"
      | "actual_end_date"
      | "size_sqft"
      | "job_slope"
      | "job_access"
      | "job_soil"
      | "job_demo"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

/** Replaces this project's full set of job-type tags (migration 0079) —
 * delete-then-insert rather than a diff, since the caller always has the
 * complete desired set from a multi-select, not an incremental add/remove. */
/** Only the removed types are deleted (never delete-all + re-insert): a
 * delete drops that type from the job's possible subs (0160 trigger). */
export async function setProjectCategories(projectId: string, categoryIds: string[]): Promise<void> {
  if (categoryIds.length) {
    const { error: insError } = await supabase
      .from("project_categories")
      .upsert(categoryIds.map((category_id) => ({ project_id: projectId, category_id })), {
        onConflict: "project_id,category_id",
        ignoreDuplicates: true,
      });
    if (insError) throw insError;
  }
  let del = supabase.from("project_categories").delete().eq("project_id", projectId);
  if (categoryIds.length) del = del.not("category_id", "in", `(${categoryIds.join(",")})`);
  const { error: delError } = await del;
  if (delError) throw delError;
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

// ---------------------------------------------------------------------------
// Overhead (0110) — see src/lib/overhead.ts for the math. Null = not set up
// (or before 0110): every screen reads exactly as before.
// ---------------------------------------------------------------------------

export async function getOverheadSettings(): Promise<OverheadSettings | null> {
  const { data, error } = await supabase.from("overhead_settings").select("*").maybeSingle();
  if (error) {
    if (error.code === "PGRST205") return null;
    throw error;
  }
  if (!data) return null;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    items: Array.isArray(data.items) && data.items.length ? data.items : OVERHEAD_SETTINGS_DEFAULTS.items,
    field_workers: n(data.field_workers),
    weeks_per_year: n(data.weeks_per_year),
    days_per_week: n(data.days_per_week),
    hours_per_day: n(data.hours_per_day),
    utilization_pct: n(data.utilization_pct),
    crew_size: Number(data.crew_size ?? 3),
    manual_man_hours: n(data.manual_man_hours),
    manual_crew_days: n(data.manual_crew_days),
    display_unit: data.display_unit === "crew_days" ? "crew_days" : "hours",
    target_margin_pct: n(data.target_margin_pct),
  };
}

export async function saveOverheadSettings(s: OverheadSettings): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("overhead_settings").upsert({ user_id: user.id, ...s }, { onConflict: "user_id" });
  if (error) throw error;
}

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

// ---------------------------------------------------------------------------
// Forecast on the schedule (0119) — risk thresholds on business_profile.
// The forecast itself comes from the weather-forecast Edge Function (see
// src/lib/forecast.ts); the math is src/lib/weatherRisk.ts.
// ---------------------------------------------------------------------------

export interface WeatherRiskSettings {
  weather_rain_pct: number;
  weather_rain_in: number;
  weather_flag_thunder: boolean;
  weather_flag_freeze: boolean;
  weather_flag_heat: boolean;
  weather_heat_f: number;
}

export const WEATHER_RISK_DEFAULTS: WeatherRiskSettings = {
  weather_rain_pct: 60,
  weather_rain_in: 0.25,
  weather_flag_thunder: true,
  weather_flag_freeze: true,
  weather_flag_heat: true,
  weather_heat_f: 95,
};

export async function getWeatherRiskSettings(): Promise<WeatherRiskSettings> {
  const { data, error } = await supabase
    .from("business_profile")
    .select("weather_rain_pct, weather_rain_in, weather_flag_thunder, weather_flag_freeze, weather_flag_heat, weather_heat_f")
    .maybeSingle();
  if (error || !data) return WEATHER_RISK_DEFAULTS;
  return { ...WEATHER_RISK_DEFAULTS, ...data, weather_rain_in: Number(data.weather_rain_in ?? WEATHER_RISK_DEFAULTS.weather_rain_in) };
}

export async function saveWeatherRiskSettings(patch: Partial<WeatherRiskSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("business_profile").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function saveBusinessProfile(patch: Partial<BusinessProfile>): Promise<BusinessProfile> {
  const merged = { ...(await getBusinessProfile()), ...patch };
  const { businessProfileProblem } = await import("./settingsRules");
  const problem = businessProfileProblem(merged);
  if (problem) throw new Error(problem);
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
  patch: Partial<Pick<ExpenseCategory, "name" | "sort_order" | "cost_type">>,
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
  const { data, error } = await selectMaterialsSections(null);
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return sortMaterialsSections((data ?? []) as unknown as MaterialsSection[]);
}

export async function createMaterialsSheet(
  projectId: string,
  input: { name?: string; sort_order?: number; feature_category_ids?: string[] } = {},
): Promise<MaterialsSheet> {
  const { data, error } = await supabase
    .from("materials_sheets")
    .insert({
      project_id: projectId,
      name: input.name?.trim() || "Cost plan",
      sort_order: input.sort_order ?? 0,
      // Only sent when given, so creating a sheet still works before 0100.
      ...(input.feature_category_ids ? { feature_category_ids: input.feature_category_ids } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * A new sheet that starts with one section per chosen project feature
 * (featureSectionSeeds, src/lib/sectionFeatures.ts): named + tagged after
 * it, Smart Section template line items with blank quantity/price. Every
 * project type the user saw (chosen or not) is recorded as accounted for,
 * so none of them raise the "was added" banner later.
 */
/** One seeded Cost plan section: named/tagged after its feature, with the
 * contractor's Smart Section template lines and labor default. */
async function insertSeededSection(
  projectId: string,
  sheetId: string,
  seed: FeatureSectionSeed,
  sortOrder: number,
  laborRate: number | undefined,
): Promise<MaterialsSection> {
  const section = await createMaterialsSection(projectId, sheetId, {
    name: seed.name,
    sort_order: sortOrder,
    smart_section_build_type: seed.smart_section_build_type,
    job_category_id: seed.job_category_id,
    feature_id: seed.feature_id ?? null,
    ...(seed.labor && (seed.labor.crew_size || seed.labor.days)
      ? {
          labor_mode: "crew" as const,
          labor_crew_size: seed.labor.crew_size,
          labor_days: seed.labor.days,
          labor_hours_per_day: 8,
          labor_rate: laborRate ?? null,
        }
      : {}),
  });
  if (seed.items.length > 0) {
    // Only send the 0162 column when a template line has a description, so
    // creating sections still works before 0162 has been run.
    const hasDescriptions = seed.items.some((i) => i.internal_description?.trim());
    const { error } = await supabase.from("materials_items").insert(
      seed.items.map((item, j) => ({
        section_id: section.id,
        name: item.name,
        quantity: item.cost_type === "material" ? 0 : 1,
        unit_cost: 0,
        sort_order: j,
        waste_percent: 0,
        tracked: item.cost_type === "material",
        // Every row carries every column: in a batch insert a key missing
        // from some rows is sent as NULL for them (cost_type is NOT NULL).
        cost_type: item.cost_type,
        unit: item.cost_type !== "material" ? LUMP_SUM_UNIT : null,
        // From the template (0162): category and default description.
        material_category_id: item.cost_type === "material" ? (item.material_category_id ?? null) : null,
        ...(hasDescriptions ? { internal_description: item.internal_description?.trim() || null } : {}),
      })),
      { defaultToNull: false },
    );
    if (error) throw error;
  }
  return section;
}

const laborRateFor = async (seeds: FeatureSectionSeed[], given?: number) =>
  given ?? (seeds.some((s) => s.labor && (s.labor.crew_size || s.labor.days))
    ? ((await getBusinessProfile().catch(() => null))?.default_labor_rate ?? undefined)
    : undefined);

export async function createMaterialsSheetWithSections(
  projectId: string,
  input: {
    name?: string;
    sort_order?: number;
    seeds: FeatureSectionSeed[];
    projectTypeIds: string[];
    /** For a template's labor default — the contractor's labor rate.
     * Read from the business profile when not passed. */
    laborRate?: number;
  },
): Promise<MaterialsSheet> {
  const laborRate = await laborRateFor(input.seeds, input.laborRate);
  const sheet = await createMaterialsSheet(projectId, {
    name: input.name,
    sort_order: input.sort_order,
    feature_category_ids: input.projectTypeIds,
  });
  for (const [i, seed] of input.seeds.entries()) {
    await insertSeededSection(projectId, sheet.id, seed, i, laborRate);
  }
  // Every cost plan has its one project-wide section, pinned last.
  await createMaterialsSection(projectId, sheet.id, { name: "General", sort_order: input.seeds.length, is_general: true });
  return sheet;
}

/**
 * The project's one Cost plan (0106), created on first use: one section per
 * live feature (prefilled from the contractor's Smart Section templates)
 * plus General.
 */
export async function getOrCreateCostPlan(projectId: string): Promise<MaterialsSheet> {
  const [existing] = await listMaterialsSheets(projectId);
  if (existing) {
    await ensureFeatureSections(projectId);
    return existing;
  }
  try {
    const sheet = await createMaterialsSheetWithSections(projectId, { name: "Cost plan", seeds: [], projectTypeIds: [] });
    await ensureFeatureSections(projectId);
    return sheet;
  } catch (err) {
    // Another tab created it first (unique per project since 0106).
    const [raced] = await listMaterialsSheets(projectId);
    if (raced) return raced;
    throw err;
  }
}

/**
 * Every live feature (active + proposed) gets its Cost plan section — the
 * automatic "one section per feature" rule. Idempotent; a no-op before the
 * project has a plan or before 0105. A new section goes right after the last
 * section of its feature type (Seating Wall 2 under Seating Wall 1), else
 * just above General. Existing sections never change their relative order,
 * so a hand-arranged plan stays as arranged.
 */
export async function ensureFeatureSections(projectId: string): Promise<number> {
  const [sheet] = await listMaterialsSheets(projectId);
  if (!sheet) return 0;
  const features = await listProjectFeatures(projectId);
  const sections = await listMaterialsBySheet(sheet.id);
  const covered = new Set(sections.map((s) => s.feature_id).filter(Boolean));
  const missing = features.filter((f) => f.status !== "removed" && !covered.has(f.id));
  if (missing.length === 0) return 0;

  const [{ featureSeeds }, categories, smartSettings, materialCategories] = await Promise.all([
    import("./sectionFeatures"),
    listCategories(),
    listSmartSectionSettings(),
    listMaterialCategories().catch(() => [] as MaterialCategory[]),
  ]);
  const { groupByType, insertIndexForType } = await import("./sectionGrouping");
  const typeOfFeature = new Map(features.map((f) => [f.id, f.category_id]));
  const seeds = featureSeeds(groupByType(missing, (f) => f.category_id), categories, smartSettings, materialCategories);
  const laborRate = await laborRateFor(seeds);

  // Work out the final order first, then insert the new sections at their
  // spots and renumber whatever moved.
  type Slot = { section: MaterialsSection | null; seed: FeatureSectionSeed | null; key: string | null; general: boolean };
  const slots: Slot[] = sections.map((sec) => ({
    section: sec,
    seed: null,
    key: sec.feature_id ? typeOfFeature.get(sec.feature_id) ?? null : null,
    general: !!sec.is_general,
  }));
  for (const seed of seeds) {
    const key = seed.feature_id ? typeOfFeature.get(seed.feature_id) ?? null : null;
    slots.splice(insertIndexForType(slots, key, (x) => x.key, (x) => x.general), 0, { section: null, seed, key, general: false });
  }
  for (const [i, slot] of slots.entries()) {
    if (slot.seed) await insertSeededSection(projectId, sheet.id, slot.seed, i, laborRate);
    else if (slot.section && slot.section.sort_order !== i) await updateMaterialsSection(slot.section.id, { sort_order: i });
  }
  return seeds.length;
}

// ---------------------------------------------------------------------------
// Project features (0105) — see src/lib/features.ts. Reads degrade to []
// before 0105 so every screen keeps working.
// ---------------------------------------------------------------------------

/** Every project's features (RLS) — for cross-project reports (Revenue). */
export async function listAllProjectFeatures(): Promise<ProjectFeature[]> {
  const base = "id, project_id, category_id, label, status, source_quote_id, sort_order, created_at";
  const { data, error } = await supabase.from("project_features").select(base).order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as unknown as ProjectFeature[];
}

export async function listProjectFeatures(projectId: string): Promise<ProjectFeature[]> {
  const run = (cols: string) =>
    supabase.from("project_features").select(cols).eq("project_id", projectId).order("sort_order").order("created_at");
  const base = "id, project_id, category_id, label, status, source_quote_id, sort_order, created_at";
  let { data, error } = await run(`${base}, milestones`);
  // before 0138
  if (error?.code === "42703") ({ data, error } = await run(base));
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as unknown as ProjectFeature[];
}

export async function createProjectFeature(
  projectId: string,
  input: { category_id: string | null; label?: string | null; status?: FeatureStatus; source_quote_id?: string | null },
): Promise<ProjectFeature> {
  // A second feature of a type goes right after the others of that type
  // (Seating Wall 2 after Seating Wall 1), later features shift down one.
  const existing = await listProjectFeatures(projectId);
  const { insertIndexForType } = await import("./sectionGrouping");
  const at = insertIndexForType(existing, input.category_id, (f) => f.category_id);
  for (const [i, f] of existing.entries()) {
    const next = i < at ? i : i + 1;
    if (f.sort_order !== next) await updateProjectFeature(f.id, { sort_order: next });
  }
  const { data, error } = await supabase
    .from("project_features")
    .insert({
      project_id: projectId,
      category_id: input.category_id,
      label: input.label?.trim() || null,
      status: input.status ?? "active",
      source_quote_id: input.source_quote_id ?? null,
      sort_order: at,
    })
    .select("id, project_id, category_id, label, status, source_quote_id, sort_order, created_at")
    .single();
  if (error) throw error;
  return data as ProjectFeature;
}

export async function updateProjectFeature(
  id: string,
  patch: Partial<Pick<ProjectFeature, "label" | "status" | "sort_order" | "milestones">>,
): Promise<void> {
  const { error } = await supabase.from("project_features").update(patch).eq("id", id);
  if (error) throw error;
}

/** Writes a new feature order (featureSortUpdates' output) — the
 * Measurements cards' drag / up-down reorder. */
export async function reorderProjectFeatures(updates: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(updates.map((u) => updateProjectFeature(u.id, { sort_order: u.sort_order })));
}

/** Crew "Post update" milestones (0138): the contractor's presets + this
 * job's own lists, keyed by feature id. Empty before 0138. */
export async function getCrewMilestones(projectId: string): Promise<{ presets: Record<string, string[]>; features: Record<string, string[]> }> {
  const { data, error } = await supabase.rpc("crew_milestones", { p_project_id: projectId });
  if (error || !data) return { presets: {}, features: {} };
  return data as { presets: Record<string, string[]>; features: Record<string, string[]> };
}

/** A new quote's starting sections: one per feature (named after it, tagged
 * with its type and feature_id). `onlyIds` limits it to those features (an
 * add-on quote); otherwise every active feature. Returns how many. */
export async function addFeatureQuoteSections(
  quoteId: string,
  projectId: string,
  categories: Category[],
  onlyIds?: string[],
): Promise<number> {
  const { featureName: nameOf, activeFeatures, liveFeatures } = await import("./features");
  const all = await listProjectFeatures(projectId);
  const { groupByType } = await import("./sectionGrouping");
  const features = groupByType(onlyIds ? liveFeatures(all).filter((f) => onlyIds.includes(f.id)) : activeFeatures(all), (f) => f.category_id);
  for (const [i, f] of features.entries()) {
    await addQuoteSection(quoteId, {
      name: nameOf(f, categories),
      sort_order: i,
      job_category_id: f.category_id,
      feature_id: f.id,
    });
  }
  return features.length;
}

/**
 * The Project type multi-selects on a project: its active types become
 * exactly `categoryIds` (a deselected type's features are marked removed,
 * data kept; a re-selected one comes back), then each new feature gets its
 * Cost plan section. Before 0105 it writes project_categories directly.
 */
export async function setProjectFeatureTypes(projectId: string, categoryIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_project_feature_types", { p_project_id: projectId, p_category_ids: categoryIds });
  if (error) {
    if (error.code === "PGRST202") return setProjectCategories(projectId, categoryIds);
    throw error;
  }
  await ensureFeatureSections(projectId);
}

export async function updateMaterialsSheet(
  id: string,
  patch: Partial<Pick<MaterialsSheet, "name" | "sort_order" | "feature_category_ids">>,
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
const MATERIALS_SECTION_SELECT = `*, materials_items(${MATERIALS_ITEM_WITH_BASELINES})`;

/** Sections with their feature's status embedded (0105); falls back to the
 * plain read before 0105 so nothing breaks while it isn't applied. */
async function selectMaterialsSections(column: "project_id" | "sheet_id" | null, value?: string) {
  const run = (select: string) => {
    let q = supabase.from("materials_sections").select(select);
    if (column) q = q.eq(column, value!);
    return q.order("sort_order");
  };
  let res = await run(`${MATERIALS_SECTION_SELECT}, feature:project_features(status, source_quote_id)`);
  if (res.error && ["PGRST200", "PGRST205", "42703"].includes(res.error.code)) res = await run(MATERIALS_SECTION_SELECT);
  return res;
}

export async function listMaterials(projectId: string): Promise<MaterialsSection[]> {
  const { data, error } = await selectMaterialsSections("project_id", projectId);
  if (error) throw error;
  return sortMaterialsSections((data ?? []) as unknown as MaterialsSection[]);
}

export async function listMaterialsBySheet(sheetId: string): Promise<MaterialsSection[]> {
  const { data, error } = await selectMaterialsSections("sheet_id", sheetId);
  if (error) throw error;
  return sortMaterialsSections((data ?? []) as unknown as MaterialsSection[]);
}

export async function createMaterialsSection(
  projectId: string,
  sheetId: string,
  input: {
    name: string;
    sort_order?: number;
    smart_section_build_type?: string | null;
    job_category_id?: string | null;
    is_general?: boolean;
    feature_id?: string | null;
  } & Partial<SectionLaborFields>,
): Promise<MaterialsSection> {
  const { name, sort_order, smart_section_build_type, job_category_id, is_general, feature_id, ...labor } = input;
  const { data, error } = await supabase
    .from("materials_sections")
    .insert({
      project_id: projectId,
      sheet_id: sheetId,
      name,
      sort_order: sort_order ?? 0,
      smart_section_build_type: smart_section_build_type ?? null,
      ...(job_category_id ? { job_category_id } : {}),
      ...(is_general ? { is_general: true } : {}),
      ...(feature_id ? { feature_id } : {}),
      ...labor,
    })
    .select("*, materials_items(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterialsSection(
  id: string,
  patch: Partial<Pick<MaterialsSection, "name" | "sort_order" | "job_category_id" | "feature_id"> & SectionLaborFields & { smart_inputs?: Record<string, unknown> | null }>,
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
    material_category_id?: string | null;
    cost_type?: LineCostType;
    vendor?: string | null;
    /** 0160 — added from this possible sub. */
    possible_sub_id?: string | null;
    /** 0162 */
    internal_description?: string | null;
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
      ...(input.material_category_id ? { material_category_id: input.material_category_id } : {}),
      ...(input.cost_type && input.cost_type !== "material" ? { cost_type: input.cost_type } : {}),
      ...(input.vendor ? { vendor: input.vendor } : {}),
      ...(input.possible_sub_id ? { possible_sub_id: input.possible_sub_id } : {}),
      ...(input.internal_description ? { internal_description: input.internal_description } : {}),
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
      | "overhead_warning_dismissed"
      | "color"
      | "material_category_id"
      | "cost_type"
      | "vendor"
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
  /** Non-material template lines (e.g. "Skid steer rental" as equipment).
   * Absent = material. */
  cost_type?: LineCostType;
  /** The line's material category, chosen in the template editor. Absent =
   * the template's default (by name); null = Uncategorized on purpose. */
  material_category_id?: string | null;
  /** Default description for lines made from this template line. Absent =
   * the template's default (none for built-ins). */
  description?: string | null;
}

/** A Smart Section template's optional labor default (0103). */
export interface SmartSectionLaborDefault {
  crew_size: number | null;
  days: number | null;
}

export interface SmartSectionSettings {
  build_type: string;
  line_items: SmartSectionLineItemSetting[] | null;
  tunables: Record<string, number>;
  labor_default?: SmartSectionLaborDefault | null;
}

export async function listSmartSectionSettings(): Promise<SmartSectionSettings[]> {
  const { data, error } = await supabase
    .from("smart_section_settings")
    .select("build_type, line_items, tunables, labor_default");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    build_type: r.build_type,
    line_items: r.line_items ?? null,
    tunables: r.tunables ?? {},
    labor_default: r.labor_default ?? null,
  }));
}

export async function saveSmartSectionSettings(
  buildType: string,
  patch: {
    line_items?: SmartSectionLineItemSetting[];
    tunables?: Record<string, number>;
    labor_default?: SmartSectionLaborDefault | null;
  },
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
  "*, project:projects(name, client:clients(name)), client:clients(name), quote_sections(*, quote_items(*, quote_item_images(*)), quote_selection_groups(*, quote_selection_options(*), quote_selection_picks(*)))";
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
    s.quote_selection_groups?.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    for (const g of s.quote_selection_groups ?? []) g.quote_selection_options?.sort((a, b) => a.sort_order - b.sort_order);
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

// The builder's read — also embeds each section's manual materials links
// (0095). Falls back to the plain select if that relationship is missing.
const QUOTE_SELECT_WITH_MATERIAL_LINKS =
  "*, project:projects(name, client:clients(name)), client:clients(name), quote_sections(*, quote_items(*, quote_item_images(*)), quote_section_material_links(materials_section_id), quote_selection_groups(*, quote_selection_options(*), quote_selection_picks(*)))";

export async function getQuote(id: string): Promise<Quote> {
  const withLinks = await supabase.from("quotes").select(QUOTE_SELECT_WITH_MATERIAL_LINKS).eq("id", id).single();
  if (!withLinks.error) return sortQuote(withLinks.data as unknown as Quote);
  if (!isMissingRelationshipError(withLinks.error)) throw withLinks.error;
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
  deposit_pct: 50,
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
  const { quoteDefaultsProblem } = await import("./settingsRules");
  const problem = quoteDefaultsProblem(merged);
  if (problem) throw new Error(problem);
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
    /** 'addon' — see createAddonQuote. */
    kind?: "original" | "addon";
  } = {},
): Promise<Quote> {
  const defaults = await getQuoteDefaults();
  // The overhead rate it's priced with (0110) — refreshable while it's a draft.
  const overhead = await getOverheadSettings().catch(() => null);
  const rate = burdenPerHour(overhead);
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      ...(rate != null ? { overhead_rate: Math.round(rate * 100) / 100, target_margin_pct: overhead?.target_margin_pct ?? null } : {}),
      project_id: input.project_id ?? null,
      client_id: input.client_id ?? null,
      deposit_percentage: input.deposit_percentage ?? defaults.deposit_pct,
      notes: input.notes ?? null,
      terms: input.terms ?? defaults.terms,
      ...(input.kind === "addon" ? { kind: "addon" } : {}),
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
      | "approved_manually_by"
      | "approval_method"
      | "approval_note"
      | "material_sheet_id"
      | "overhead_rate"
      | "target_margin_pct"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuote(id: string): Promise<void> {
  // A deleted add-on's proposed features go with it (hidden, kept).
  await supabase.from("project_features").update({ status: "removed" }).eq("source_quote_id", id).eq("status", "proposed");
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

/**
 * "Add new work" on a Won job (0108): new features — status proposed, tied
 * to a new add-on quote — each with a quote section and a Cost plan section
 * (marked proposed, not counted until the client approves). Returns the
 * add-on quote.
 */
export async function createAddonQuote(
  projectId: string,
  input: { client_id: string | null; features: { category_id: string; label?: string | null }[] },
): Promise<Quote> {
  const quote = await createQuote({ project_id: projectId, client_id: input.client_id, kind: "addon" });
  const created: string[] = [];
  for (const f of input.features) {
    const feature = await createProjectFeature(projectId, {
      category_id: f.category_id,
      label: f.label ?? null,
      status: "proposed",
      source_quote_id: quote.id,
    });
    created.push(feature.id);
  }
  await addFeatureQuoteSections(quote.id, projectId, await listCategories(), created);
  await getOrCreateCostPlan(projectId);
  return getQuote(quote.id);
}

// ---------------------------------------------------------------------------
// Quote sections & items
// ---------------------------------------------------------------------------

export async function addQuoteSection(
  quoteId: string,
  input: {
    name: string;
    is_optional?: boolean;
    sort_order?: number;
    job_category_id?: string | null;
    feature_id?: string | null;
    materials_link_mode?: QuoteSectionMaterialsLinkMode;
  },
): Promise<QuoteSection> {
  const { data, error } = await supabase
    .from("quote_sections")
    .insert({
      quote_id: quoteId,
      name: input.name,
      is_optional: input.is_optional ?? false,
      sort_order: input.sort_order ?? 0,
      // Only sent when set, so adding a section still works before 0095.
      ...(input.job_category_id ? { job_category_id: input.job_category_id } : {}),
      ...(input.feature_id ? { feature_id: input.feature_id } : {}),
      ...(input.materials_link_mode === "manual" ? { materials_link_mode: "manual" } : {}),
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
  patch: Partial<Pick<QuoteSection, "name" | "is_optional" | "sort_order" | "job_category_id" | "feature_id" | "materials_link_mode">>,
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
    quick_quote_build_type?: string | null;
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
      // Only sent when set, so adding an ordinary line works before 0102.
      ...(input.quick_quote_build_type ? { quick_quote_build_type: input.quick_quote_build_type } : {}),
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
      | "quick_quote_build_type"
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

const INVOICE_SELECT = "*, project:projects(name, client_id, client:clients(name))";

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
  let numbersQuery = supabase.from("invoices").select("invoice_number");
  numbersQuery = input.project_id
    ? numbersQuery.eq("project_id", input.project_id)
    : numbersQuery.is("project_id", null);
  const { data: numbers, error: countError } = await numbersQuery;
  if (countError) throw countError;
  const invoice_number = nextInvoiceNumber((numbers ?? []).map((r) => r.invoice_number));

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

/** How the Won transaction (0075) and createProjectInvoice() mark a
 * project's deposit invoice — its notes are exactly this. */
export const DEPOSIT_INVOICE_NOTE = "Deposit";

/**
 * Starts an invoice from a project — every "new invoice" entry point that
 * already knows its project (the project's Invoices tab, the project page's
 * deposit CTA, the mobile + menu while on a project). The project is
 * pre-linked (so the invoice's client is the project's client) and the
 * amount is pre-filled from the project's headline quote:
 *   - "deposit": the quote's deposit % of the contract value, marked as the
 *     deposit invoice;
 *   - "balance": the contract value minus everything already invoiced;
 *   - "auto" (default): the deposit while the project has no deposit invoice
 *     yet and its quote asks for one, else the balance.
 * Returns the draft; the user edits it before sending.
 */
export async function createProjectInvoice(
  projectId: string,
  kind: "auto" | "deposit" | "balance" = "auto",
): Promise<Invoice> {
  const [quotes, changeOrders, invoices] = await Promise.all([
    listQuotes(projectId),
    listChangeOrders(projectId),
    listInvoices(projectId),
  ]);
  const headline = pickHeadlineQuote(quotes);
  const contract = projectContractValue(quotes, changeOrders);
  const depositPct = headline ? Number(headline.deposit_percentage) : 0;
  const hasDeposit = invoices.some((i) => i.notes === DEPOSIT_INVOICE_NOTE);
  const asDeposit = kind === "deposit" || (kind === "auto" && !hasDeposit && depositPct > 0 && contract > 0);
  // The deposit is on the original quote; add-ons draft their own (0108).
  const depositBase = headline ? quoteTotal(headline.quote_sections) : contract;
  const { remainingToInvoice, depositAmount } = await import("./projectMoney");
  const amount = asDeposit ? depositAmount(depositBase, depositPct) : remainingToInvoice(contract, invoices);

  const invoice = await createInvoice({
    project_id: projectId,
    amount: Math.round(amount * 100) / 100,
    quote_id: headline?.id ?? null,
    notes: asDeposit ? DEPOSIT_INVOICE_NOTE : null,
  });
  void logProjectEvent(
    projectId,
    "invoice_created",
    `${invoice.invoice_number ?? "Invoice"} drafted · ${asDeposit ? "deposit" : "balance"}`,
    { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
  );
  return invoice;
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
  // An invoice with money applied can't just vanish (its payments would
  // silently turn into loose project credit) — void or move them first.
  const { data: inv, error: readError } = await supabase.from("invoices").select("amount_paid, invoice_number").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (inv && Number(inv.amount_paid ?? 0) > 0.004)
    throw new Error(`${inv.invoice_number ?? "This invoice"} has payments applied. Void them or apply them to another invoice first.`);
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

/** The next "INV-00N": one past the highest number already used on the
 * project (or among standalone invoices) — never a count, which re-used a
 * number after a delete (INV-001, INV-003 left → a second INV-003). */
export function nextInvoiceNumber(existing: (string | null | undefined)[]): string {
  const max = existing.reduce((m, n) => {
    const hit = /(\d+)\s*$/.exec(n ?? "");
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `INV-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Payments (0111) — money received, at the project level, independent of
// invoices. Allocations apply part or all of a payment to one or more
// invoices; the rest is unallocated project credit. Invoices only ever
// reflect applied payments (amount_paid / status are trigger-synced).
// Never hard-deleted: voided payments stay, crossed out, out of totals.
// Every change is audited in payment_events by DB triggers.
// ---------------------------------------------------------------------------

export type PaymentMethod = "check" | "cash" | "card" | "ach" | "zelle" | "venmo" | "other";

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at: string;
  invoice?: { invoice_number: string | null } | null;
}

export interface Payment {
  id: string;
  user_id: string;
  project_id: string | null;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  status: "active" | "void";
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  receipt_number: string | null;
  share_token: string;
  created_at: string;
  updated_at: string;
  payment_allocations: PaymentAllocation[];
  project?: { name: string; client_id: string | null; client: { name: string } | null } | null;
}

export interface PaymentEvent {
  id: string;
  payment_id: string;
  user_id: string | null;
  action: "created" | "edited" | "voided" | "restored" | "applied" | "unapplied" | "migrated";
  changes: Record<string, unknown>;
  created_at: string;
}

const PAYMENT_SELECT =
  "*, payment_allocations(*, invoice:invoices(invoice_number)), project:projects(name, client_id, client:clients(name))";

/** Every payment (void included) — for one project, or all of them. */
export async function listPayments(projectId?: string): Promise<Payment[]> {
  let query = supabase.from("payments").select(PAYMENT_SELECT).order("paid_on", { ascending: false }).order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Payment[];
}

/** Payments with any allocation to this invoice (void included). */
export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  const { data: allocs, error: aErr } = await supabase.from("payment_allocations").select("payment_id").eq("invoice_id", invoiceId);
  if (aErr) throw aErr;
  const ids = [...new Set((allocs ?? []).map((a) => a.payment_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("payments").select(PAYMENT_SELECT).in("id", ids).order("paid_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Payment[];
}

export async function listPaymentsForClient(clientId: string): Promise<Payment[]> {
  const projects = await listProjectsForClient(clientId);
  if (projects.length === 0) return [];
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .in("project_id", projects.map((p) => p.id))
    .order("paid_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Payment[];
}

export interface PaymentInput {
  project_id: string | null;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
}

export interface AllocationInput {
  invoice_id: string;
  amount: number;
}

const cleanAllocations = (allocs: AllocationInput[]) =>
  allocs.filter((a) => a.invoice_id && Number(a.amount) > 0.004).map((a) => ({ invoice_id: a.invoice_id, amount: Math.round(Number(a.amount) * 100) / 100 }));

/** Records a payment (receipt number assigned by the DB) and applies it to
 * the given invoices. The rest stays unallocated project credit. */
export async function createPayment(input: PaymentInput, allocations: AllocationInput[] = []): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      project_id: input.project_id,
      amount: Math.round(input.amount * 100) / 100,
      paid_on: input.paid_on,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const rows = cleanAllocations(allocations).map((a) => ({ ...a, payment_id: data.id }));
  if (rows.length) {
    const { error: aErr } = await supabase.from("payment_allocations").insert(rows);
    if (aErr) {
      // Keep it atomic from the user's view — no half-recorded payment.
      await supabase.from("payments").update({ status: "void", void_reason: "Allocation failed", voided_at: new Date().toISOString() }).eq("id", data.id);
      throw aErr;
    }
  }
  if (input.project_id) {
    void logProjectEvent(input.project_id, "payment_received", `Payment received · $${input.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { payment_id: data.id });
  }
  return getPayment(data.id);
}

export async function getPayment(id: string): Promise<Payment> {
  const { data, error } = await supabase.from("payments").select(PAYMENT_SELECT).eq("id", id).single();
  if (error) throw error;
  return data as unknown as Payment;
}

/** Edits the payment's own fields (audited by trigger). */
export async function updatePayment(id: string, patch: Partial<Omit<PaymentInput, "project_id">>): Promise<void> {
  const clean: Record<string, unknown> = { ...patch };
  if ("amount" in patch) clean.amount = Math.round(Number(patch.amount) * 100) / 100;
  if ("reference" in patch) clean.reference = patch.reference?.trim() || null;
  if ("note" in patch) clean.note = patch.note?.trim() || null;
  const { error } = await supabase.from("payments").update(clean).eq("id", id);
  if (error) throw error;
}

/** Replaces a payment's allocations — diffed, so the audit trail records
 * only what actually changed. Anything removed returns to credit. */
export async function setPaymentAllocations(paymentId: string, next: AllocationInput[]): Promise<void> {
  const { data: current, error } = await supabase.from("payment_allocations").select("id, invoice_id, amount").eq("payment_id", paymentId);
  if (error) throw error;
  const want = new Map(cleanAllocations(next).map((a) => [a.invoice_id, a.amount]));
  const ops: PromiseLike<{ error: unknown }>[] = [];
  // Removals / decreases first so the within-amount check never trips mid-way.
  for (const c of current ?? []) {
    if (!want.has(c.invoice_id)) {
      const { error: e } = await supabase.from("payment_allocations").delete().eq("id", c.id);
      if (e) throw e;
    }
  }
  for (const c of current ?? []) {
    const amt = want.get(c.invoice_id);
    if (amt != null && Math.abs(amt - Number(c.amount)) > 0.004) {
      const { error: e } = await supabase.from("payment_allocations").update({ amount: amt }).eq("id", c.id);
      if (e) throw e;
    }
  }
  const existing = new Set((current ?? []).map((c) => c.invoice_id));
  const inserts = [...want].filter(([inv]) => !existing.has(inv)).map(([invoice_id, amount]) => ({ payment_id: paymentId, invoice_id, amount }));
  if (inserts.length) {
    const { error: e } = await supabase.from("payment_allocations").insert(inserts);
    if (e) throw e;
  }
  void ops;
}

/** Voids a payment — it stays visible (crossed out) and leaves every
 * total; its invoice allocations stop counting. Never deleted. */
export async function voidPayment(id: string, reason: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("payments")
    .update({ status: "void", voided_at: new Date().toISOString(), voided_by: auth.user?.id ?? null, void_reason: reason?.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function restorePayment(id: string): Promise<void> {
  // Never overpay: if an invoice this payment was applied to has since been
  // paid another way, restoring would count the money twice.
  const { data: allocs, error: allocError } = await supabase.from("payment_allocations").select("invoice_id, amount").eq("payment_id", id);
  if (allocError) throw allocError;
  if (allocs?.length) {
    const { data: invs, error: invError } = await supabase
      .from("invoices")
      .select("id, amount, amount_paid, invoice_number")
      .in("id", allocs.map((a) => a.invoice_id));
    if (invError) throw invError;
    const { restoreOverpays } = await import("./projectMoney");
    const over = restoreOverpays(allocs as { invoice_id: string; amount: number }[], (invs ?? []) as Invoice[]);
    if (over.length)
      throw new Error(
        `Restoring this would overpay ${over.map((o) => `${o.invoice_number ?? "an invoice"} by $${o.over.toFixed(2)}`).join(" and ")} — it's been paid another way since. Edit this payment's allocation first, or leave it void.`,
      );
  }
  const { error } = await supabase.from("payments").update({ status: "active", voided_at: null, voided_by: null, void_reason: null }).eq("id", id);
  if (error) throw error;
}

export async function listPaymentEvents(paymentId: string): Promise<PaymentEvent[]> {
  const { data, error } = await supabase.from("payment_events").select("*").eq("payment_id", paymentId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaymentEvent[];
}

/**
 * Applies up to `amount` of the project's unallocated credit to an invoice —
 * oldest payments with credit first, each topping up (or creating) its
 * allocation to this invoice.
 */
export async function applyProjectCredit(projectId: string, invoiceId: string, amount: number): Promise<number> {
  const payments = (await listPayments(projectId)).filter((p) => p.status === "active").reverse();
  let left = Math.round(amount * 100) / 100;
  for (const p of payments) {
    if (left <= 0.004) break;
    const applied = p.payment_allocations.reduce((s, a) => s + Number(a.amount), 0);
    const free = Math.round((Number(p.amount) - applied) * 100) / 100;
    if (free <= 0.004) continue;
    const take = Math.min(free, left);
    const next = p.payment_allocations.map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }));
    const mine = next.find((a) => a.invoice_id === invoiceId);
    if (mine) mine.amount += take;
    else next.push({ invoice_id: invoiceId, amount: take });
    await setPaymentAllocations(p.id, next);
    left = Math.round((left - take) * 100) / 100;
  }
  return Math.round((amount - left) * 100) / 100;
}

/** The contractor's business on a public share page (0150, client_business_json). */
export interface SharedBusiness {
  company_name: string | null;
  phone: string | null;
  email: string | null;
  license: string | null;
  address: string | null;
  logo_url?: string | null;
}

export interface SharedReceipt {
  receipt: {
    number: string | null;
    amount: number;
    paid_on: string;
    method: PaymentMethod;
    reference: string | null;
    status: "active" | "void";
    voided_at: string | null;
  };
  business: {
    company_name: string | null;
    phone: string | null;
    email: string | null;
    license: string | null;
    address: string | null;
  } | null;
  client: { name: string } | null;
  project: { name: string; address: string | null } | null;
  applied_to: { invoice_number: string | null; amount: number }[];
  contract_value: number | null;
  received_through: number | null;
  remaining_balance: number | null;
}

/** The public receipt (/receipt/:token) — client-facing fields only. */
export async function getSharedReceipt(token: string): Promise<SharedReceipt | null> {
  const { data, error } = await supabase.rpc("get_shared_receipt", { p_token: token });
  if (error) throw error;
  return clientSharedReceipt((data as SharedReceipt) ?? null);
}

// ---------------------------------------------------------------------------
// Document versions + Client view (0113)
// ---------------------------------------------------------------------------

export type VersionedDocType = "quote" | "change_order" | "invoice";

/** Snapshot a document after saving it while it's out with the client — a
 * new version when its client-facing content changed. No-op for drafts. */
export async function snapshotDocument(type: VersionedDocType, id: string): Promise<void> {
  const { error } = await supabase.rpc("snapshot_document", { p_type: type, p_id: id });
  if (error) console.warn("snapshot_document failed:", error.message);
}

/** Exactly what the client sees in the Client Hub, for the contractor's
 * "Client view" preview and the project summary PDF. */
export async function getClientViewProject(projectId: string): Promise<PortalProjectDetail | null> {
  const { data, error } = await supabase.rpc("get_client_view_project", { p_project_id: projectId });
  if (error) throw error;
  return data ? clientSafeProjectDetail(data as PortalProjectDetail) : null;
}

/** How many versions each document on a project has (the workspaces'
 * "Versions" link). */
export async function listDocumentVersionCounts(projectId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("document_versions").select("doc_id, version").eq("project_id", projectId);
  if (error) return new Map();
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.doc_id, Math.max(m.get(r.doc_id) ?? 0, r.version));
  return m;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Omitting projectId returns every expense the user owns, across all
 * projects — used by the global Expenses list. */
export async function listExpenses(projectId?: string): Promise<Expense[]> {
  const build = (select: string) => {
    let query = supabase.from("expenses").select(select).order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  };
  // Split lines (0096) ride along; falls back to the plain read until the
  // migration has run.
  const withLines = await build("*, project:projects(name), expense_lines(*)");
  if (!withLines.error) {
    return ((withLines.data ?? []) as unknown as Expense[]).map((e) => ({
      ...e,
      expense_lines: [...(e.expense_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }));
  }
  if (withLines.error.code !== "PGRST200") throw withLines.error;
  const { data, error } = await build("*, project:projects(name)");
  if (error) throw error;
  return (data ?? []) as unknown as Expense[];
}

/**
 * Replaces an expense's split lines (0096). Two or more lines = split;
 * saving zero or one line un-splits it — the single line's category (if
 * any) becomes the expense's own category again.
 */
export async function saveExpenseLines(
  expenseId: string,
  lines: {
    expense_category_id: string | null;
    amount: number;
    description: string | null;
    feature_id?: string | null;
    cost_type?: CostBucket | null;
  }[],
): Promise<void> {
  const { error: delError } = await supabase.from("expense_lines").delete().eq("expense_id", expenseId);
  if (delError) throw delError;
  if (lines.length <= 1) {
    await updateExpense(expenseId, {
      expense_category_id: lines[0]?.expense_category_id ?? null,
      ...(lines[0] && "feature_id" in lines[0] ? { feature_id: lines[0].feature_id ?? null } : {}),
      ...(lines[0]?.cost_type ? { cost_type: lines[0].cost_type } : {}),
    });
    return;
  }
  const { error } = await supabase.from("expense_lines").insert(
    lines.map((l, i) => {
      const { feature_id, cost_type, ...rest } = l;
      return {
        expense_id: expenseId,
        ...rest,
        sort_order: i,
        ...(feature_id ? { feature_id } : {}),
        ...(cost_type ? { cost_type } : {}),
      };
    }),
  );
  if (error) throw error;
  // The expense's own single category no longer applies once it's split.
  await updateExpense(expenseId, { expense_category_id: null });
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
  feature_id?: string | null;
  cost_type?: CostBucket | null;
  vendor?: string | null;
  notes?: string | null;
  receipt_path?: string | null;
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
      ...(input.feature_id ? { feature_id: input.feature_id } : {}),
      ...(input.cost_type ? { cost_type: input.cost_type } : {}),
      // 0151 columns — only sent when set, so the insert works before it's run.
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      ...(input.receipt_path ? { receipt_path: input.receipt_path } : {}),
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
  patch: Partial<
    Pick<Expense, "expense_category_id" | "date" | "feature_id" | "cost_type" | "name" | "amount" | "vendor" | "notes" | "receipt_path">
  >,
): Promise<void> {
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  // Best-effort: its receipt photo (0151) goes with it.
  try {
    const { data } = await supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
    const path = (data as { receipt_path?: string | null } | null)?.receipt_path;
    if (path) await supabase.storage.from(IMAGES_BUCKET).remove([path]);
  } catch (err) {
    console.warn("Failed to clean up the expense receipt before deleting it:", err);
  }
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
  // Sections carry each change's feature + price lines (0107) — what a
  // feature's price and history read. Falls back to the bare rows.
  const run = (select: string) => {
    let query = supabase.from("change_orders").select(select).order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  };
  let res = await run("*, change_order_sections(id, feature_id, scope_note, change_order_items(price, quantity))");
  if (res.error && ["PGRST200", "42703"].includes(res.error.code)) res = await run("*");
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as ChangeOrder[];
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

/** Deleting a change order cascades its sections/items/images at the DB
 * level, but never touches the actual files in Storage — best-effort clean
 * those up first, same pattern as deleteQuoteSection. */
/** The client agreed outside the app (0139): approve it, recording how and
 * by whom — same downstream effects as a client approval (all trigger-driven). */
export async function contractorApproveChangeOrder(input: {
  changeOrderId: string;
  method: "in_person" | "paper" | "other";
  note: string | null;
  signedBy: string | null;
  approvedOn: string;
  recordedBy: string;
}): Promise<void> {
  const { error } = await supabase.rpc("contractor_approve_change_order", {
    p_change_order_id: input.changeOrderId,
    p_method: input.method,
    p_note: input.note,
    p_signed_by: input.signedBy,
    p_approved_on: input.approvedOn,
    p_recorded_by: input.recordedBy,
  });
  if (error) throw error;
}

/** An invoice billing one approved change order (its amount, linked by change_order_id). */
export async function createChangeOrderInvoice(co: Pick<ChangeOrder, "id" | "project_id" | "title" | "amount" | "status">): Promise<Invoice> {
  // Never bill a change order twice (or a credit / unapproved one).
  const { data: existing, error: existingError } = await supabase.from("invoices").select("id").eq("change_order_id", co.id);
  if (existingError) throw existingError;
  const { changeOrderInvoiceable } = await import("./projectBilling");
  const can = changeOrderInvoiceable(co, existing ?? []);
  if ("reason" in can)
    throw new Error(
      can.reason === "already_invoiced"
        ? "This change order already has an invoice."
        : can.reason === "credit"
          ? "A credit comes off the balance — there's nothing to invoice."
          : "Only an approved change order can be invoiced.",
    );
  const invoice = await createInvoice({
    project_id: co.project_id,
    change_order_id: co.id,
    amount: Number(co.amount),
    notes: `Change order: ${co.title}`,
  });
  void logProjectEvent(co.project_id, "invoice_created", `${invoice.invoice_number ?? "Invoice"} drafted · change order`, {
    invoice_id: invoice.id,
    change_order_id: co.id,
  });
  return invoice;
}

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
// ---------------------------------------------------------------------------
// Change order planned-cost changes (0107) — add / edit / remove a feature's
// Cost plan lines, or change its labor. Applied by SQL when the change order
// is approved; see src/lib/changeOrderCost.ts for the deltas.
// ---------------------------------------------------------------------------

export interface ChangeOrderCostChange {
  id: string;
  change_order_id: string;
  section_id: string | null;
  feature_id: string | null;
  kind: CostChangeKind;
  materials_item_id: string | null;
  materials_section_id: string | null;
  line: Record<string, unknown>;
  before: Record<string, unknown> | null;
  applied_item_id: string | null;
  sort_order: number;
  created_at: string;
}

export async function listChangeOrderCostChanges(changeOrderId: string): Promise<ChangeOrderCostChange[]> {
  const { data, error } = await supabase
    .from("change_order_cost_changes")
    .select("*")
    .eq("change_order_id", changeOrderId)
    .order("sort_order");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []) as ChangeOrderCostChange[];
}

/** Every not-yet-decided (draft / sent) change order's cost changes on a
 * project — the Cost plan's "Pending CO" overlay. */
export async function listPendingCostChanges(
  projectId: string,
): Promise<(ChangeOrderCostChange & { change_order: { id: string; title: string; status: string; created_at: string } })[]> {
  const { data, error } = await supabase
    .from("change_order_cost_changes")
    .select("*, change_order:change_orders!inner(id, title, status, created_at, project_id)")
    .eq("change_order.project_id", projectId)
    .in("change_order.status", ["draft", "sent"])
    .order("sort_order");
  if (error) {
    if (["PGRST205", "PGRST200"].includes(error.code)) return [];
    throw error;
  }
  return (data ?? []) as never;
}

export async function createChangeOrderCostChange(
  input: Omit<ChangeOrderCostChange, "id" | "applied_item_id" | "created_at">,
): Promise<ChangeOrderCostChange> {
  const { data, error } = await supabase.from("change_order_cost_changes").insert(input).select("*").single();
  if (error) throw error;
  return data as ChangeOrderCostChange;
}

export async function updateChangeOrderCostChange(
  id: string,
  patch: Partial<Pick<ChangeOrderCostChange, "line" | "before" | "sort_order" | "section_id" | "feature_id" | "materials_section_id">>,
): Promise<void> {
  const { error } = await supabase.from("change_order_cost_changes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChangeOrderCostChange(id: string): Promise<void> {
  const { error } = await supabase.from("change_order_cost_changes").delete().eq("id", id);
  if (error) throw error;
}

/** A feature's life after its original scope (0107/0108): approved or
 * declined change orders and add-on quotes, with cost / price before and
 * after. */
export interface FeatureHistoryEvent {
  id: string;
  feature_id: string;
  project_id: string;
  change_order_id: string | null;
  quote_id: string | null;
  event: "change_order_approved" | "change_order_declined" | "addon_approved" | "addon_declined";
  label: string | null;
  cost_before: number;
  cost_after: number;
  price_before: number;
  price_after: number;
  details: { title?: string; scope?: string | null; changes?: { kind: CostChangeKind; line: Record<string, unknown>; before: Record<string, unknown> | null }[] };
  created_at: string;
}

export async function listFeatureHistory(projectId: string): Promise<FeatureHistoryEvent[]> {
  const { data, error } = await supabase
    .from("feature_history")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    ...r,
    cost_before: Number(r.cost_before),
    cost_after: Number(r.cost_after),
    price_before: Number(r.price_before),
    price_after: Number(r.price_after),
  })) as FeatureHistoryEvent[];
}

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
  input: { name: string; sort_order?: number; feature_id?: string | null; scope_note?: string | null },
): Promise<ChangeOrderSection> {
  const { data, error } = await supabase
    .from("change_order_sections")
    .insert({
      change_order_id: changeOrderId,
      name: input.name,
      sort_order: input.sort_order ?? 0,
      ...(input.feature_id ? { feature_id: input.feature_id } : {}),
      ...(input.scope_note ? { scope_note: input.scope_note } : {}),
    })
    .select("*, change_order_items(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateChangeOrderSection(
  id: string,
  patch: Partial<Pick<ChangeOrderSection, "name" | "sort_order" | "feature_id" | "scope_note">>,
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
  /** What's changing on this part of the job, e.g. "+2 lights on the backrest". */
  scope_note?: string | null;
  items: SharedChangeOrderItem[];
}

export interface SharedChangeOrder {
  business?: SharedBusiness | null;
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
  return clientSharedChangeOrder((data as SharedChangeOrder | null) ?? null);
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
export type MaterialOrderUnit = "pallet" | "ton" | "cubic_yard" | "bag" | "linear_foot" | "each" | "square_foot" | "roll" | "tube" | "layer";

export const MATERIAL_ORDER_UNITS: { value: MaterialOrderUnit; label: string; plural: string }[] = [
  { value: "pallet", label: "Pallet", plural: "pallets" },
  { value: "ton", label: "Ton", plural: "tons" },
  { value: "cubic_yard", label: "Cubic yard", plural: "cubic yards" },
  { value: "bag", label: "Bag", plural: "bags" },
  { value: "linear_foot", label: "Linear foot", plural: "linear feet" },
  { value: "square_foot", label: "Square foot", plural: "square feet" },
  { value: "roll", label: "Roll", plural: "rolls" },
  { value: "tube", label: "Tube", plural: "tubes" },
  { value: "layer", label: "Layer", plural: "layers" },
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
  /** A delivery issue on this line (0152) — open until issue_resolved_at. */
  issue?: DeliveryIssueKind | null;
  issue_note?: string | null;
  /** Backordered: when the rest is expected. */
  issue_expected_on?: string | null;
  issue_resolved_at?: string | null;
}

export type DeliveryIssueKind = "short" | "damaged" | "wrong_item" | "backordered";
export const DELIVERY_ISSUE_LABEL: Record<DeliveryIssueKind, string> = {
  short: "Short",
  damaged: "Damaged",
  wrong_item: "Wrong item / color",
  backordered: "Backordered",
};

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
  /** 0152: when it was ordered, the supplier's PO / confirmation #, when it arrived. */
  ordered_on?: string | null;
  po_number?: string | null;
  delivered_on?: string | null;
  /** 0152: pallet deposits — charged = delivered × each, credit = returned × each. */
  pallets_delivered?: number | null;
  pallets_returned?: number | null;
  pallet_deposit_each?: number | null;
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
  po_number?: string | null;
  delivered_on?: string | null;
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
      // 0152 — only sent when set, so creating works before it's run.
      ...(input.po_number?.trim() ? { po_number: input.po_number.trim() } : {}),
      ...(input.delivered_on ? { delivered_on: input.delivered_on } : input.status === "delivered" && input.expected_delivery_date ? { delivered_on: input.expected_delivery_date } : {}),
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
  patch: Partial<
    Pick<
      MaterialOrder,
      | "supplier"
      | "expected_delivery_date"
      | "status"
      | "notes"
      | "ordered_on"
      | "po_number"
      | "delivered_on"
      | "pallets_delivered"
      | "pallets_returned"
      | "pallet_deposit_each"
    >
  >,
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
    Pick<
      MaterialOrderItem,
      | "description"
      | "quantity"
      | "unit"
      | "sort_order"
      | "materials_item_id"
      | "unit_price"
      | "status"
      | "issue"
      | "issue_note"
      | "issue_expected_on"
      | "issue_resolved_at"
    >
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

/**
 * Log a delivery against an order (0152). Each line: what arrived. All of
 * it → the line is delivered; some → the line splits into the delivered
 * part and an open remainder (still on order — same order, so the next
 * delivery logs against it); none → it stays on order. The order reads
 * delivered once nothing is left open. Optional issue per line (short /
 * damaged / wrong item / backordered). Splitting keeps every existing
 * ordered / delivered helper (tracking, precon, alerts, crew) unchanged.
 */
export async function logDelivery(input: {
  order: MaterialOrder;
  deliveredOn: string;
  lines: {
    itemId: string;
    received: number;
    unitPrice?: number | null;
    issue?: DeliveryIssueKind | null;
    issueNote?: string | null;
    issueExpectedOn?: string | null;
  }[];
}): Promise<void> {
  const byId = new Map(input.order.material_order_items.map((i) => [i.id, i]));
  let openLeft = 0;
  let sort = Math.max(0, ...input.order.material_order_items.map((i) => i.sort_order)) + 1;
  for (const l of input.lines) {
    const item = byId.get(l.itemId);
    if (!item) continue;
    const already = (item.status ?? input.order.status) === "delivered";
    if (already) continue;
    const ordered = Number(item.quantity);
    const received = Math.max(0, Math.min(ordered, Number(l.received) || 0));
    const issuePatch = l.issue
      ? { issue: l.issue, issue_note: l.issueNote?.trim() || null, issue_expected_on: l.issueExpectedOn || null, issue_resolved_at: null }
      : {};
    const pricePatch = l.unitPrice != null ? { unit_price: l.unitPrice } : {};
    if (received >= ordered - 1e-9) {
      await updateMaterialOrderItem(item.id, { status: "delivered", ...pricePatch, ...issuePatch });
    } else if (received > 0) {
      await updateMaterialOrderItem(item.id, { quantity: received, status: "delivered", ...pricePatch, ...issuePatch });
      const { error } = await supabase.from("material_order_items").insert({
        material_order_id: input.order.id,
        description: item.description,
        quantity: Math.round((ordered - received) * 1000) / 1000,
        unit: item.unit,
        sort_order: sort++,
        materials_item_id: item.materials_item_id,
        unit_price: l.unitPrice ?? item.unit_price,
        status: null,
      });
      if (error) throw error;
      openLeft++;
    } else {
      if (l.issue) await updateMaterialOrderItem(item.id, issuePatch);
      openLeft++;
    }
  }
  // Lines not in the form stay as they were.
  for (const item of input.order.material_order_items) {
    if (input.lines.some((l) => l.itemId === item.id)) continue;
    if ((item.status ?? input.order.status) !== "delivered") openLeft++;
  }
  await updateMaterialOrder(input.order.id, {
    ...(openLeft === 0 ? { status: "delivered" as const } : {}),
    delivered_on: input.deliveredOn,
  });
  // Items that were delivered through the override now match the order.
  if (openLeft === 0) {
    const { error } = await supabase.from("material_order_items").update({ status: null }).eq("material_order_id", input.order.id).eq("status", "delivered");
    if (error) throw error;
  }
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
  | "labor_logged"
  | "payment_received"
  | "payment_voided"
  | "schedule_delay"
  | "schedule_delay_undone"
  | "client_heads_up"
  | "review_requested"
  | "review_link_clicked"
  | "order_sheet_emailed";

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
  /** Client Selections (0115) — client-facing fields only. */
  selections?: import("./portalApi").PortalSelectionGroup[];
}

export interface SharedQuote {
  business?: SharedBusiness | null;
  quote: {
    id: string;
    status: QuoteStatus;
    /** 'addon' = new work on a job the client already signed (client_quote_json). */
    kind?: "original" | "addon";
    addon_number?: number | null;
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
  return clientSharedQuote((data as SharedQuote | null) ?? null);
}

/** The client ticks / unticks an optional item on the share link — saved,
 * so signing and the deposit use it (set_quote_item_selection, 0008; the
 * approved-quote lock, 0033, rejects it once signed). */
export async function setSharedQuoteItemSelection(token: string, itemId: string, selected: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_quote_item_selection", { p_token: token, p_item_id: itemId, p_selected: selected });
  if (error) throw error;
}

export async function signSharedQuote(token: string, signedBy: string): Promise<void> {
  const { error } = await supabase.rpc("sign_quote", { p_token: token, p_signed_by: signedBy });
  if (error) throw error;
}

export interface SharedInvoice {
  business?: SharedBusiness | null;
  invoice: {
    id: string;
    status: InvoiceStatus;
    amount: number;
    due_date: string | null;
    notes: string | null;
    paid_at: string | null;
    /** Applied payments (0111). */
    amount_paid?: number;
    invoice_number: string | null;
    created_at: string;
    updated_at: string;
  };
  // Null for a standalone invoice (no linked project).
  project: { name: string } | null;
  client: { name: string } | null;
  /** Itemised invoices (0097) — empty for a single-amount invoice. */
  items?: { description: string; quantity: number; unit_price: number }[];
}

export async function getSharedInvoice(token: string): Promise<SharedInvoice | null> {
  const { data, error } = await supabase.rpc("get_shared_invoice", { p_token: token });
  if (error) throw error;
  return clientSharedInvoice((data as SharedInvoice | null) ?? null);
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
  /** Crew work order (0125) — may mark it Reviewed / download the PDF. */
  is_lead?: boolean;
  /** Crew work order (0125) — may log material usage from the work order. */
  can_log_usage?: boolean;
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
  if (error) {
    // Non-2xx (e.g. 409 "That email belongs to a client"): the function's JSON is on the response.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.message ?? error.message);
  }
  if (!data?.ok || !data.employee) throw new Error(data?.message ?? "Couldn't create employee.");
  return data.employee;
}

/**
 * "Email to supplier" (send-supplier-email Edge Function, Resend): sends
 * the order sheet PDF as an attachment and logs it on the project. Throws
 * the function's own message — incl. `code: "not_configured"` before the
 * Resend secrets are set.
 */
export async function emailOrderSheet(input: {
  projectId: string;
  to: string;
  supplierName: string | null;
  subject: string;
  message: string;
  filename: string;
  pdfBase64: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; message?: string }>("send-supplier-email", { body: input });
  if (error) {
    // Non-2xx: the function's JSON body is on the response.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    const err = new Error(body?.message ?? (error.message.includes("Failed to send") ? "Couldn't reach the email service — is the send-supplier-email function deployed?" : error.message));
    (err as Error & { code?: string }).code = body?.error;
    throw err;
  }
  if (!data?.ok) throw new Error(data?.message ?? "The email didn't send.");
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
  /** Crew forecast strip (0119) — the scheduled window, dates only. */
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  address?: string | null;
  actual_start_date?: string | null;
}

/** The crew's own jobs — through crew_projects() (0125); crews can't read
 * project rows directly (those hold overhead / margin / internal notes). */
export async function listMyAssignedProjects(): Promise<AssignedProject[]> {
  const { data, error } = await supabase.rpc("crew_projects");
  if (error) throw error;
  return (data ?? []) as AssignedProject[];
}

export async function getAssignedProject(id: string): Promise<AssignedProject> {
  const all = await listMyAssignedProjects();
  const p = all.find((x) => x.id === id);
  if (!p) throw new Error("This job isn't assigned to you.");
  return p;
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
  | "quote_selection_changed"
  | "quote_optional_changed"
  | "review_link_clicked"
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
  | "task_created"
  // 0155 — opportunity archive / restore / delete (the delete is logged by the DB).
  | "opportunity_archived"
  | "opportunity_restored"
  | "opportunity_deleted";

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
  /** Internal free-text site conditions — access, slope, drainage, soil,
   * utilities (0099; was `measurements`). Never shown on quotes or in the
   * Client Hub. Real measurements live on the project (0098). */
  site_conditions: string | null;
  lost_reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_contact_date: string | null;
  quote_id: string | null;
  project_id: string | null;
  /** 0127 — a maintenance lead: the original job it came from. */
  source_project_id?: string | null;
  /** 0155 — archived: hidden from the pipeline and lists, restorable from
   * the Opportunities page's Archived filter. Undefined before 0155. */
  archived_at?: string | null;
  /** 0155 — the old jsonb list; superseded by the possible_subs table
   * (0160, listPossibleSubs). Never read or written now. */
  possible_subs?: unknown;
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
  "*, client:clients(name), opportunity_categories(category_id), project:projects!opportunities_project_id_fkey(project_categories(category_id))";

/** Live opportunities — archived ones (0155) are left out unless asked
 * for. Filtered here rather than in SQL so it works before 0155 too. */
async function fetchOpportunities(archived: boolean): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_SELECT)
    .order("updated_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return ((data ?? []) as Opportunity[]).filter((o) => !!o.archived_at === archived);
}

export async function listOpportunities(): Promise<Opportunity[]> {
  return fetchOpportunities(false);
}

/** Archived opportunities (0155) — the Opportunities page's Archived filter. */
export async function listArchivedOpportunities(): Promise<Opportunity[]> {
  return fetchOpportunities(true);
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
  return ((data ?? []) as Opportunity[]).filter((o) => !o.archived_at);
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  const { data, error } = await supabase.from("opportunities").select(OPPORTUNITY_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

/** A possible subcontracted item spotted at the site visit (0155; rows +
 * many features since 0160). */
export interface PossibleSub {
  id: string;
  /** Preset key ("gas_line"…) or "custom". */
  kind: string;
  label: string;
  note: string | null;
  /** The project types it serves, in the job's order; empty = General. */
  category_ids: string[];
  /** Cost plan lines added from it (materials_items.possible_sub_id) — any
   * = "Added to cost plan". */
  lines: { id: string; section_id: string }[];
}

const MIGRATION_0160 = "Run migration 0160 to save possible subcontracted work.";
const is0160Missing = (e: { code?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01" || e.code === "42703" || e.code === "PGRST200");

type PossibleSubRow = {
  id: string;
  kind: string;
  label: string;
  note: string | null;
  sort_order: number;
  possible_sub_categories: { category_id: string; sort_order: number }[] | null;
  materials_items: { id: string; section_id: string }[] | null;
};

/** An opportunity's possible subcontracted work, in order (0160). Empty
 * before 0160. */
export async function listPossibleSubs(opportunityId: string): Promise<PossibleSub[]> {
  const { data, error } = await supabase
    .from("possible_subs")
    .select("id, kind, label, note, sort_order, possible_sub_categories(category_id, sort_order), materials_items(id, section_id)")
    .eq("opportunity_id", opportunityId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    if (is0160Missing(error)) return [];
    throw error;
  }
  return ((data ?? []) as PossibleSubRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    note: r.note,
    category_ids: [...(r.possible_sub_categories ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((c) => c.category_id),
    lines: r.materials_items ?? [],
  }));
}

export async function createPossibleSub(
  opportunityId: string,
  input: { kind: string; label: string; note?: string | null; category_ids: string[]; sort_order: number },
): Promise<string> {
  const { data, error } = await supabase
    .from("possible_subs")
    .insert({ opportunity_id: opportunityId, kind: input.kind, label: input.label, note: input.note ?? null, sort_order: input.sort_order })
    .select("id")
    .single();
  if (error) throw is0160Missing(error) ? new Error(MIGRATION_0160) : error;
  if (input.category_ids.length) await setPossibleSubCategories(data.id, [], input.category_ids);
  return data.id;
}

export async function updatePossibleSub(id: string, patch: { label?: string; note?: string | null }): Promise<void> {
  const row: { label?: string; note?: string | null } = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.note !== undefined) row.note = patch.note;
  const { error } = await supabase.from("possible_subs").update(row).eq("id", id);
  if (error) throw error;
}

export async function deletePossibleSub(id: string): Promise<void> {
  const { error } = await supabase.from("possible_subs").delete().eq("id", id);
  if (error) throw error;
}

/** Replace an item's features: adds / reorders first, then removes only
 * what's gone (never delete-all + re-insert). */
export async function setPossibleSubCategories(subId: string, prev: string[], next: string[]): Promise<void> {
  if (next.length) {
    const { error } = await supabase
      .from("possible_sub_categories")
      .upsert(next.map((category_id, i) => ({ possible_sub_id: subId, category_id, sort_order: i })), { onConflict: "possible_sub_id,category_id" });
    if (error) throw error;
  }
  const removed = prev.filter((c) => !next.includes(c));
  if (removed.length) {
    const { error } = await supabase.from("possible_sub_categories").delete().eq("possible_sub_id", subId).in("category_id", removed);
    if (error) throw error;
  }
}

/** What's attached to an opportunity and what (if anything) blocks
 * deleting it — 0155's opportunity_delete_check. */
export interface OpportunityDeleteCheck {
  can_delete: boolean;
  blockers: string[];
  counts: {
    project: boolean;
    cost_plans: number;
    quotes: number;
    measurements: number;
    photos: number;
    appointments: number;
    tasks: number;
  };
}

const NEEDS_0155 = "Run migration 0155 to archive or delete opportunities.";
const missing0155 = (code?: string) => code === "PGRST202" || code === "42883" || code === "42703" || code === "PGRST204";

export async function checkOpportunityDelete(id: string): Promise<OpportunityDeleteCheck> {
  const { data, error } = await supabase.rpc("opportunity_delete_check", { p_opportunity_id: id });
  if (error) throw missing0155(error.code) ? new Error(NEEDS_0155) : error;
  return data as OpportunityDeleteCheck;
}

/** Deletes an opportunity and its never-Won background project (the DB
 * re-checks every blocker). Photo files are removed from Storage first,
 * best-effort — the rows go with the delete. */
export async function deleteOpportunity(id: string): Promise<void> {
  const opp = await getOpportunity(id);
  const paths: string[] = [];
  const { data: oppPhotos } = await supabase.from("opportunity_photos").select("storage_path").eq("opportunity_id", id);
  paths.push(...(oppPhotos ?? []).map((r) => r.storage_path));
  if (opp.project_id) {
    const { data: projectPhotos } = await supabase.from("project_images").select("storage_path").eq("project_id", opp.project_id);
    paths.push(...(projectPhotos ?? []).map((r) => r.storage_path));
  }
  const { error } = await supabase.rpc("delete_opportunity", { p_opportunity_id: id });
  if (error) throw missing0155(error.code) ? new Error(NEEDS_0155) : error;
  if (paths.length > 0) await supabase.storage.from(IMAGES_BUCKET).remove(paths).catch(() => undefined);
}

export async function archiveOpportunity(id: string): Promise<void> {
  const opp = await getOpportunity(id);
  const { error } = await supabase.from("opportunities").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw missing0155(error.code) ? new Error(NEEDS_0155) : error;
  await logActivity(opp.client_id, "opportunity_archived", `Archived opportunity "${opp.title}"`, { opportunity_id: id }).catch(() => undefined);
}

export async function restoreOpportunity(id: string): Promise<void> {
  const opp = await getOpportunity(id);
  const { error } = await supabase.from("opportunities").update({ archived_at: null }).eq("id", id);
  if (error) throw missing0155(error.code) ? new Error(NEEDS_0155) : error;
  await logActivity(opp.client_id, "opportunity_restored", `Restored opportunity "${opp.title}"`, { opportunity_id: id }).catch(() => undefined);
}

/** Latest activity per opportunity (the Opportunities list's "Last activity"). */
export async function listOpportunityLastActivity(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("activities")
    .select("opportunity_id, created_at")
    .not("opportunity_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  const latest = new Map<string, string>();
  if (error) return latest;
  for (const r of data ?? []) if (!latest.has(r.opportunity_id)) latest.set(r.opportunity_id, r.created_at);
  return latest;
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
/** Same diff rule as setProjectCategories (0160 prune trigger). */
export async function setOpportunityCategories(opportunityId: string, categoryIds: string[]): Promise<void> {
  if (categoryIds.length) {
    const { error: insError } = await supabase
      .from("opportunity_categories")
      .upsert(categoryIds.map((category_id) => ({ opportunity_id: opportunityId, category_id })), {
        onConflict: "opportunity_id,category_id",
        ignoreDuplicates: true,
      });
    if (insError) throw insError;
  }
  let del = supabase.from("opportunity_categories").delete().eq("opportunity_id", opportunityId);
  if (categoryIds.length) del = del.not("category_id", "in", `(${categoryIds.join(",")})`);
  const { error: delError } = await del;
  if (delError) throw delError;
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
      | "site_conditions"
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
  // Date, then date-only before timed, then time (compareAppointments).
  return (data ?? []).sort(compareAppointments);
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
  // Date, then date-only before timed, then time (compareAppointments).
  return (data ?? []).sort(compareAppointments);
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
  // Date, then date-only before timed, then time (compareAppointments).
  return (data ?? []).sort(compareAppointments);
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
  await logActivity(
    input.client_id,
    "appointment_scheduled",
    // "Appointment scheduled: Site visit · Fri, Sep 25 · 9:30 AM"
    `Appointment scheduled: ${APPOINTMENT_TYPE_LABEL[input.type ?? "site_visit"]} · ${appointmentWhenLabel({
      date_time: input.date_time,
      all_day: input.all_day ?? false,
    })}`,
    {
    opportunity_id: input.opportunity_id ?? null,
      meta: { appointment_id: data.id, date_time: input.date_time },
    },
  );
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
      | "all_day"
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
// Project measurements — feature instances (0098: typed data + computed
// totals per patio/wall/kitchen…) and custom label/qty/unit rows (0091).
// All shape/math knowledge lives in src/lib/measurements.ts; this is just
// storage.
// ---------------------------------------------------------------------------

export async function listFeatureMeasurements(projectId: string): Promise<FeatureInstance[]> {
  const { data, error } = await supabase
    .from("project_feature_measurements")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    if (error.code === "PGRST205") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({ ...r, data: r.data ?? {}, totals: r.totals ?? {} }));
}

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

/** Applies a Measurements card draft: upserts changed feature instances +
 * custom rows (ids are client-generated for new ones) and deletes the
 * removed ones. Also writes the paved surface total back into
 * projects.size_sqft (see totalSurfaceSqft) so the Labor page keeps
 * reading one number. */
export async function saveProjectMeasurements(
  projectId: string,
  changes: {
    instances: FeatureInstance[];
    deleteInstanceIds: string[];
    customRows: MeasurementRow[];
    deleteCustomIds: string[];
  },
  sizeSqft: number | null,
): Promise<void> {
  // Whitelisted payloads (never a loaded row spread — see
  // featureMeasurementPayload), and writes before deletes: if anything
  // fails, nothing has been deleted yet.
  if (changes.instances.length > 0) {
    const { error } = await supabase
      .from("project_feature_measurements")
      .upsert(changes.instances.map((r) => featureMeasurementPayload(r, projectId)), { defaultToNull: false });
    if (error) throw error;
  }
  if (changes.customRows.length > 0) {
    const { error } = await supabase
      .from("project_measurements")
      .upsert(changes.customRows.map((r) => customMeasurementPayload(r, projectId)), { defaultToNull: false });
    if (error) throw error;
  }
  if (changes.deleteInstanceIds.length > 0) {
    const { error } = await supabase.from("project_feature_measurements").delete().in("id", changes.deleteInstanceIds);
    if (error) throw error;
  }
  if (changes.deleteCustomIds.length > 0) {
    const { error } = await supabase.from("project_measurements").delete().in("id", changes.deleteCustomIds);
    if (error) throw error;
  }
  await updateProject(projectId, { size_sqft: sizeSqft });
}

// ---------------------------------------------------------------------------
// Labor log (0085) — actual hours logged against a job category ("scope")
// once the job runs. Planned labor lives on the Cost plan sections' labor
// blocks (0103); the old cost_plan_items / labor_plan_entries tables were
// moved into the cost plan by 0104 and are no longer read. See
// src/lib/laborPlan.ts for the planned-vs-actual and productivity math.
// ---------------------------------------------------------------------------

/** Actual labor logged in the field. `employee_id` links a real
 * Employee-Only Mode login; `worker_name` is free text for a crew member
 * who isn't one (or a snapshot if the employee is later removed) — same
 * "denormalized text, not a hard FK" shape as Suppliers / usage logs'
 * logged_by. */
export interface LaborEntry {
  id: string;
  project_id: string;
  category_id: string | null;
  /** The project feature the hours were for (0105) — null = General. */
  feature_id?: string | null;
  employee_id: string | null;
  worker_name: string | null;
  entry_date: string;
  hours: number;
  hourly_rate: number | null;
  cost: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** Timesheets (0131): clock times, where it came from, its timesheet, the
   * regular / overtime split (computed in the DB). */
  start_at?: string | null;
  end_at?: string | null;
  break_minutes?: number;
  source?: "owner" | "manual" | "timer";
  timesheet_id?: string | null;
  reg_hours?: number | null;
  ot_hours?: number | null;
  timesheet?: { status: TimesheetStatus } | null;
}

export async function listLaborEntries(projectId: string): Promise<LaborEntry[]> {
  const { data, error } = await supabase
    .from("labor_entries")
    .select("*, timesheet:timesheets(status)")
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
  feature_id?: string | null;
}): Promise<LaborEntry> {
  const { data, error } = await supabase
    .from("labor_entries")
    .insert({
      project_id: input.project_id,
      category_id: input.category_id,
      ...(input.feature_id ? { feature_id: input.feature_id } : {}),
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
  patch: Partial<Pick<LaborEntry, "category_id" | "employee_id" | "worker_name" | "entry_date" | "hours" | "hourly_rate" | "cost" | "note" | "project_id" | "start_at" | "end_at" | "break_minutes">>,
): Promise<void> {
  const { error } = await supabase.from("labor_entries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteLaborEntry(id: string): Promise<void> {
  const { error } = await supabase.from("labor_entries").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Planned vs actual feedback loop (0114) — closeouts, estimating insights.
// Internal only: nothing here is ever read by the client-facing serializer.
// ---------------------------------------------------------------------------

export interface VarianceThresholdSettings {
  variance_amber_pct: number;
  variance_red_pct: number;
}

export async function getVarianceThresholds(): Promise<VarianceThresholdSettings> {
  const { data, error } = await supabase.from("business_profile").select("variance_amber_pct, variance_red_pct").maybeSingle();
  if (error || !data) return { variance_amber_pct: 0, variance_red_pct: 10 };
  return { variance_amber_pct: Number(data.variance_amber_pct ?? 0), variance_red_pct: Number(data.variance_red_pct ?? 10) };
}

export async function saveVarianceThresholds(patch: VarianceThresholdSettings): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("business_profile").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

const CLOSEOUT_SELECT = "*, project:projects(name)";

/** Every closeout the contractor has (current and superseded). */
export async function listCloseouts(): Promise<import("./closeout").Closeout[]> {
  const { data, error } = await supabase.from("project_closeouts").select(CLOSEOUT_SELECT).order("created_at", { ascending: false });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []) as unknown as import("./closeout").Closeout[];
}

export async function listProjectCloseouts(projectId: string): Promise<import("./closeout").Closeout[]> {
  const { data, error } = await supabase
    .from("project_closeouts")
    .select(CLOSEOUT_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as import("./closeout").Closeout[];
}

/** Snapshot a closeout; any earlier current closeout of the project is
 * marked superseded (never overwritten). */
export async function createCloseout(input: {
  project_id: string;
  snapshot: unknown;
  context: unknown;
  features: unknown;
  what_happened?: string | null;
  excluded?: boolean;
}): Promise<void> {
  const { error: sErr } = await supabase
    .from("project_closeouts")
    .update({ superseded_at: new Date().toISOString() })
    .eq("project_id", input.project_id)
    .is("superseded_at", null);
  if (sErr) throw sErr;
  const { error } = await supabase.from("project_closeouts").insert({
    project_id: input.project_id,
    snapshot: input.snapshot,
    context: input.context,
    features: input.features,
    what_happened: input.what_happened?.trim() || null,
    excluded: !!input.excluded,
  });
  if (error) throw error;
}

export async function updateCloseout(id: string, patch: { what_happened?: string | null; excluded?: boolean }): Promise<void> {
  const clean = { ...patch, ...(patch.what_happened !== undefined ? { what_happened: patch.what_happened?.trim() || null } : {}) };
  const { error } = await supabase.from("project_closeouts").update(clean).eq("id", id);
  if (error) throw error;
}

export interface EstimatingAdjustment {
  id: string;
  build_type: string;
  /** "slot:<calculator slot>" or "labor_hours" */
  target: string;
  condition: Record<string, string>;
  factor: number;
  label: string;
  active: boolean;
  recommendation_key: string | null;
  created_at: string;
}

export async function listEstimatingAdjustments(): Promise<EstimatingAdjustment[]> {
  const { data, error } = await supabase.from("estimating_adjustments").select("*").order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as EstimatingAdjustment[];
}

export async function setEstimatingAdjustmentActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("estimating_adjustments").update({ active }).eq("id", id);
  if (error) throw error;
}

export type RecommendationStatus = "open" | "applied" | "applied_condition" | "dismissed" | "snoozed";

export interface RecommendationState {
  key: string;
  status: RecommendationStatus;
  snooze_until: string | null;
  evidence: unknown;
  updated_at: string;
}

export async function listRecommendationStates(): Promise<RecommendationState[]> {
  const { data, error } = await supabase.from("estimating_recommendations").select("key, status, snooze_until, evidence, updated_at");
  if (error) return [];
  return (data ?? []) as RecommendationState[];
}

export async function setRecommendationState(key: string, status: RecommendationStatus, extra: { snooze_until?: string | null; evidence?: unknown } = {}): Promise<void> {
  const { error } = await supabase
    .from("estimating_recommendations")
    .upsert({ key, status, snooze_until: extra.snooze_until ?? null, evidence: extra.evidence ?? null, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
}

export interface EstimatingChange {
  id: string;
  recommendation_key: string | null;
  kind: "tunable" | "labor_default" | "adjustment";
  build_type: string;
  field: string | null;
  adjustment_id: string | null;
  before_value: unknown;
  after_value: unknown;
  summary: string;
  applied_at: string;
  undone_at: string | null;
}

export async function listEstimatingChanges(): Promise<EstimatingChange[]> {
  const { data, error } = await supabase.from("estimating_changes").select("*").order("applied_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as EstimatingChange[];
}

/**
 * The ONLY place a recommendation changes anything — called from an
 * explicit Apply tap. Records before/after for undo.
 *   mode "default":   base → the calculator's base coverage (tons per sq
 *                     ft follow); labor → the build type's labor default
 *                     days (or, with no labor default, an every-job labor
 *                     adjustment).
 *   mode "condition": an adjustment used only on jobs matching the
 *                     recommendation's condition.
 */
export async function applyRecommendation(
  rec: import("./estimatingInsights").Recommendation,
  mode: "default" | "condition",
  current: { tunables: Record<string, number>; laborDefault: SmartSectionLaborDefault | null; baseCoverageDefault: number },
): Promise<string> {
  const pct = Math.round((rec.median - 1) * 100);
  const cond = mode === "condition" ? (rec.condition ?? {}) : {};
  const addAdjustment = async (target: string, label: string) => {
    const { data, error } = await supabase
      .from("estimating_adjustments")
      .insert({ build_type: rec.build_type, target, condition: cond, factor: rec.median, label, recommendation_key: rec.key })
      .select("id")
      .single();
    if (error) throw error;
    const summary = `${label}: ×${rec.median}`;
    const { error: cErr } = await supabase.from("estimating_changes").insert({
      recommendation_key: rec.key,
      kind: "adjustment",
      build_type: rec.build_type,
      adjustment_id: data.id,
      after_value: { factor: rec.median, condition: cond },
      summary,
    });
    if (cErr) throw cErr;
    return summary;
  };

  let summary: string;
  if (rec.kind === "base") {
    if (mode === "condition") {
      summary = await addAdjustment("slot:base_material", `${rec.buildTypeLabel} base${rec.conditionLabel ? ` (${rec.conditionLabel})` : ""} ${pct >= 0 ? "+" : ""}${pct}%`);
    } else {
      const field = "base_coverage_sqft_per_ton";
      const before = current.tunables[field] ?? current.baseCoverageDefault;
      const after = Math.round((before / rec.median) * 10) / 10;
      await saveSmartSectionSettings(rec.build_type, { tunables: { ...current.tunables, [field]: after } });
      summary = `${rec.buildTypeLabel}: base coverage ${before} → ${after} sq ft per ton`;
      const { error } = await supabase.from("estimating_changes").insert({
        recommendation_key: rec.key,
        kind: "tunable",
        build_type: rec.build_type,
        field,
        before_value: current.tunables[field] ?? null,
        after_value: after,
        summary,
      });
      if (error) throw error;
    }
  } else if (mode === "default" && current.laborDefault?.days) {
    const before = current.laborDefault;
    const after = { ...before, days: Math.max(0.5, Math.round(before.days! * rec.median * 2) / 2) };
    await saveSmartSectionSettings(rec.build_type, { labor_default: after });
    summary = `${rec.buildTypeLabel}: default labor ${before.days} → ${after.days} days`;
    const { error } = await supabase.from("estimating_changes").insert({
      recommendation_key: rec.key,
      kind: "labor_default",
      build_type: rec.build_type,
      field: "labor_default",
      before_value: before,
      after_value: after,
      summary,
    });
    if (error) throw error;
  } else {
    summary = await addAdjustment("labor_hours", `${rec.buildTypeLabel} labor${mode === "condition" && rec.conditionLabel ? ` (${rec.conditionLabel})` : ""} ${pct >= 0 ? "+" : ""}${pct}%`);
  }
  await setRecommendationState(rec.key, mode === "condition" ? "applied_condition" : "applied", { evidence: { median: rec.median, jobs: rec.evidence.length } });
  return summary;
}

/** Undo one applied change: restores the before value (or turns the
 * adjustment off) and re-opens its recommendation. */
export async function undoEstimatingChange(change: EstimatingChange): Promise<void> {
  if (change.kind === "adjustment") {
    if (change.adjustment_id) await setEstimatingAdjustmentActive(change.adjustment_id, false);
  } else {
    const settings = (await listSmartSectionSettings()).find((x) => x.build_type === change.build_type);
    if (change.kind === "tunable" && change.field) {
      const tunables = { ...(settings?.tunables ?? {}) };
      if (change.before_value == null) delete tunables[change.field];
      else tunables[change.field] = Number(change.before_value);
      await saveSmartSectionSettings(change.build_type, { tunables });
    } else if (change.kind === "labor_default") {
      await saveSmartSectionSettings(change.build_type, { labor_default: (change.before_value as SmartSectionLaborDefault) ?? null });
    }
  }
  const { error } = await supabase.from("estimating_changes").update({ undone_at: new Date().toISOString() }).eq("id", change.id);
  if (error) throw error;
  if (change.recommendation_key) await setRecommendationState(change.recommendation_key, "open");
}

// ---------------------------------------------------------------------------
// Client Selections (0115) — contractor side. Groups / options are saved
// straight from their dialog (not the builder draft); a quote that's out
// with the client gets a new version afterwards (snapshotDocument).
// ---------------------------------------------------------------------------

export interface SelectionOptionDraft {
  id?: string;
  name: string;
  description?: string | null;
  image_path?: string | null;
  catalog_product_id?: string | null;
  color?: string | null;
  price_delta: number;
  cost_delta: number;
  link_item_id?: string | null;
  link_set?: QuoteSelectionOption["link_set"];
  is_default: boolean;
}

export interface SelectionGroupDraft {
  id?: string;
  name: string;
  help_text?: string | null;
  required: boolean;
  multi: boolean;
  options: SelectionOptionDraft[];
}

/** Create or update a group and its options (options diffed by id). */
export async function saveSelectionGroup(quoteSectionId: string, draft: SelectionGroupDraft, sortOrder = 0): Promise<string> {
  let groupId = draft.id;
  const groupRow = {
    name: draft.name.trim(),
    help_text: draft.help_text?.trim() || null,
    required: draft.required,
    multi: draft.multi,
  };
  if (groupId) {
    const { error } = await supabase.from("quote_selection_groups").update(groupRow).eq("id", groupId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("quote_selection_groups")
      .insert({ ...groupRow, quote_section_id: quoteSectionId, sort_order: sortOrder })
      .select("id")
      .single();
    if (error) throw error;
    groupId = data.id;
  }
  const { data: existing, error: exErr } = await supabase.from("quote_selection_options").select("id").eq("group_id", groupId);
  if (exErr) throw exErr;
  const keep = new Set(draft.options.map((o) => o.id).filter(Boolean));
  const remove = (existing ?? []).map((o) => o.id).filter((id) => !keep.has(id));
  // A removed option takes its picks with it (the client's draft pick is
  // cleared; a required group then flags as not chosen).
  if (remove.length) {
    const { error } = await supabase.from("quote_selection_options").delete().in("id", remove);
    if (error) throw error;
  }
  for (const [i, o] of draft.options.entries()) {
    const row = {
      name: o.name.trim(),
      description: o.description?.trim() || null,
      image_path: o.image_path ?? null,
      catalog_product_id: o.catalog_product_id ?? null,
      color: o.color?.trim() || null,
      price_delta: Math.round((Number(o.price_delta) || 0) * 100) / 100,
      cost_delta: Math.round((Number(o.cost_delta) || 0) * 100) / 100,
      link_item_id: o.link_item_id ?? null,
      link_set: o.link_item_id ? (o.link_set ?? {}) : {},
      is_default: o.is_default,
      sort_order: i,
    };
    if (o.id) {
      const { error } = await supabase.from("quote_selection_options").update(row).eq("id", o.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("quote_selection_options").insert({ ...row, group_id: groupId });
      if (error) throw error;
    }
  }
  return groupId!;
}

export async function deleteSelectionGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from("quote_selection_groups").delete().eq("id", groupId);
  if (error) throw error;
}

/** The contractor picks on the client's behalf (before approval). */
export async function setContractorSelectionPicks(groupId: string, optionIds: string[]): Promise<void> {
  const { error: dErr } = await supabase.from("quote_selection_picks").delete().eq("group_id", groupId);
  if (dErr) throw dErr;
  if (!optionIds.length) return;
  const { error } = await supabase
    .from("quote_selection_picks")
    .insert(optionIds.map((option_id) => ({ group_id: groupId, option_id, picked_by: "contractor" })));
  if (error) throw error;
}

/** Share-link picks (by token) — the public quote page. */
export async function setSharedQuoteSelection(token: string, groupId: string, optionIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_shared_quote_selection", { p_token: token, p_group_id: groupId, p_option_ids: optionIds });
  if (error) throw error;
}

export async function uploadSelectionImage(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const compressed = await compressImageFile(file);
  const path = `selection-options/${auth.user!.id}/${randomImageFilename(file.name)}`;
  const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, compressed, { upsert: false });
  if (error) throw error;
  return path;
}

export interface SelectionGroupTemplate {
  id: string;
  name: string;
  help_text: string | null;
  required: boolean;
  multi: boolean;
  options: Omit<SelectionOptionDraft, "id" | "link_item_id" | "link_set">[];
  updated_at: string;
}

export async function listSelectionTemplates(): Promise<SelectionGroupTemplate[]> {
  const { data, error } = await supabase.from("selection_group_templates").select("*").order("name");
  if (error) return [];
  return (data ?? []) as SelectionGroupTemplate[];
}

export async function saveSelectionTemplate(t: Omit<SelectionGroupTemplate, "id" | "updated_at"> & { id?: string }): Promise<void> {
  const row = { name: t.name.trim(), help_text: t.help_text?.trim() || null, required: t.required, multi: t.multi, options: t.options };
  const { error } = t.id
    ? await supabase.from("selection_group_templates").update(row).eq("id", t.id)
    : await supabase.from("selection_group_templates").insert(row);
  if (error) throw error;
}

export async function deleteSelectionTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("selection_group_templates").delete().eq("id", id);
  if (error) throw error;
}

export interface SelectionHistoryRow {
  id: string;
  group_id: string;
  source: "original" | "change_order";
  change_order_id: string | null;
  option_ids: string[];
  option_names: string[];
  price: number;
  created_at: string;
}

export interface SelectionChangeRequest {
  id: string;
  project_id: string | null;
  quote_id: string | null;
  group_id: string;
  requested_option_id: string | null;
  note: string | null;
  status: "open" | "converted" | "completed" | "declined" | "closed";
  change_order_id: string | null;
  requested_by: string | null;
  created_at: string;
}

/** A project's approved selections, with history and open change requests. */
export async function listProjectSelections(projectId: string): Promise<{
  groups: (QuoteSelectionGroup & { section: { id: string; name: string; feature_id: string | null; quote_id: string; is_optional: boolean }; quote: { id: string; status: string; kind: string | null } })[];
  history: SelectionHistoryRow[];
  requests: SelectionChangeRequest[];
}> {
  const { data, error } = await supabase
    .from("quote_selection_groups")
    .select("*, quote_selection_options(*), quote_selection_picks(*), section:quote_sections!inner(id, name, feature_id, quote_id, is_optional, quote:quotes!inner(id, status, kind, project_id))")
    .eq("section.quote.project_id", projectId);
  if (error) return { groups: [], history: [], requests: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = ((data ?? []) as any[]).map((g) => ({ ...g, quote: g.section.quote }));
  const ids = groups.map((g) => g.id);
  const [{ data: history }, { data: requests }] = await Promise.all([
    ids.length ? supabase.from("quote_selection_history").select("*").in("group_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("selection_change_requests").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  for (const g of groups) g.quote_selection_options?.sort((a: QuoteSelectionOption, b: QuoteSelectionOption) => a.sort_order - b.sort_order);
  return { groups, history: (history ?? []) as SelectionHistoryRow[], requests: (requests ?? []) as SelectionChangeRequest[] };
}

export async function updateSelectionChangeRequest(id: string, patch: Partial<Pick<SelectionChangeRequest, "status" | "change_order_id">>): Promise<void> {
  const { error } = await supabase.from("selection_change_requests").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * "Create change order" for an approved selection: a draft change order on
 * the feature, prefilled with the swap (old → new option), the price
 * difference as its line, the cost difference as a planned-cost change
 * (the linked Cost plan line's new values, or an added line), and the
 * selection change itself — which moves the pick only once the change
 * order is approved. A same-price swap is a $0 change order, on record.
 */
export async function createSelectionChangeOrder(input: {
  projectId: string;
  group: QuoteSelectionGroup & { section: { name: string; feature_id: string | null } };
  toOptionIds: string[];
  requestId?: string | null;
}): Promise<ChangeOrder> {
  const options = input.group.quote_selection_options ?? [];
  const fromIds = (input.group.quote_selection_picks ?? []).map((p) => p.option_id);
  const from = options.filter((o) => fromIds.includes(o.id));
  const to = options.filter((o) => input.toOptionIds.includes(o.id));
  const names = (list: QuoteSelectionOption[]) => list.map((o) => o.name).join(", ") || "none";
  const priceDelta = to.reduce((s, o) => s + Number(o.price_delta), 0) - from.reduce((s, o) => s + Number(o.price_delta), 0);
  const costDelta = to.reduce((s, o) => s + Number(o.cost_delta), 0) - from.reduce((s, o) => s + Number(o.cost_delta), 0);
  const title = `${input.group.name}: ${names(from)} → ${names(to)}`;

  const co = await createChangeOrder({ project_id: input.projectId, title, reason: "client_request", description: "Client selection change" });
  const section = await addChangeOrderSection(co.id, { name: input.group.section.name, feature_id: input.group.section.feature_id });
  await addChangeOrderItem(section.id, { name: title, price: Math.round(priceDelta * 100) / 100, quantity: 1 });
  await updateChangeOrder(co.id, { amount: Math.round(priceDelta * 100) / 100 });

  // Planned-cost changes: the linked line's new product / price, else the
  // internal cost difference as its own line.
  const linked = to.find((o) => o.link_item_id);
  if (linked?.link_item_id) {
    const { data: item } = await supabase.from("materials_items").select("*").eq("id", linked.link_item_id).maybeSingle();
    if (item) {
      await createChangeOrderCostChange({
        change_order_id: co.id,
        section_id: section.id,
        feature_id: input.group.section.feature_id,
        kind: "edit",
        materials_item_id: item.id,
        materials_section_id: item.section_id,
        line: {
          name: linked.link_set?.name || item.name,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_cost: linked.link_set?.unit_cost != null ? Number(linked.link_set.unit_cost) : Number(item.unit_cost),
          waste_percent: Number(item.waste_percent ?? 0),
          cost_type: item.cost_type ?? "material",
          vendor: item.vendor ?? null,
        },
        before: { name: item.name, quantity: Number(item.quantity), unit: item.unit, unit_cost: Number(item.unit_cost), waste_percent: Number(item.waste_percent ?? 0), cost_type: item.cost_type ?? "material" },
        sort_order: 0,
      } as never);
    }
  } else if (Math.abs(costDelta) >= 0.01) {
    await createChangeOrderCostChange({
      change_order_id: co.id,
      section_id: section.id,
      feature_id: input.group.section.feature_id,
      kind: "add",
      materials_item_id: null,
      materials_section_id: null,
      line: { name: `Selection change: ${title}`, quantity: 1, unit: "lump sum", unit_cost: Math.round(costDelta * 100) / 100, waste_percent: 0, cost_type: "other" },
      before: null,
      sort_order: 0,
    } as never);
  }

  const { error } = await supabase.from("change_order_selection_changes").insert({
    change_order_id: co.id,
    group_id: input.group.id,
    from_option_ids: fromIds,
    to_option_ids: input.toOptionIds,
    price_delta: Math.round(priceDelta * 100) / 100,
    cost_delta: Math.round(costDelta * 100) / 100,
  });
  if (error) throw error;
  if (input.requestId) await updateSelectionChangeRequest(input.requestId, { status: "converted", change_order_id: co.id });
  return getChangeOrder(co.id);
}

/** Crew view — approved choices only, no prices. */
export async function listEmployeeProjectSelections(projectId: string): Promise<{ section: string; group: string; choices: string[] }[]> {
  const { data, error } = await supabase.rpc("employee_project_selections", { p_project_id: projectId });
  if (error) return [];
  return (data ?? []) as { section: string; group: string; choices: string[] }[];
}

// ---------------------------------------------------------------------------
// Quote activity tracking (0117) — internal only.
// ---------------------------------------------------------------------------

export interface QuoteViewSession {
  id: string;
  quote_id: string;
  version: number | null;
  channel: "hub" | "link";
  device: "mobile" | "tablet" | "desktop";
  started_at: string;
  last_seen_at: string;
  active_seconds: number;
  sections: string[];
}

export interface QuoteActivityEvent {
  id: string;
  quote_id: string;
  session_id: string | null;
  version: number | null;
  kind: "opened" | "selection_changed" | "optional_changed" | "pdf_downloaded" | "approved" | "declined";
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export async function listQuoteActivity(quoteId: string): Promise<{ sessions: QuoteViewSession[]; events: QuoteActivityEvent[] }> {
  const [s, e] = await Promise.all([
    supabase.from("quote_view_sessions").select("*").eq("quote_id", quoteId).order("started_at", { ascending: false }),
    supabase.from("quote_activity_events").select("*").eq("quote_id", quoteId).order("created_at", { ascending: false }),
  ]);
  return { sessions: (s.data ?? []) as QuoteViewSession[], events: (e.data ?? []) as QuoteActivityEvent[] };
}

/** Share-link tracking (anon). The page skips it while signed in to the app. */
export async function trackSharedQuoteView(token: string, sessionKey: string, device: string, activeSeconds: number, sections: string[]): Promise<void> {
  await supabase.rpc("track_shared_quote_view", { p_token: token, p_session_key: sessionKey, p_device: device, p_active_seconds: activeSeconds, p_sections: sections });
}

export async function trackSharedQuoteEvent(token: string, sessionKey: string, kind: "pdf_downloaded" | "optional_changed", detail: Record<string, unknown> = {}): Promise<void> {
  await supabase.rpc("track_quote_event", { p_quote_id: null, p_token: token, p_session_key: sessionKey, p_kind: kind, p_detail: detail });
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  quote_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw error;
}

export interface NotificationSettings {
  quote_first_open: boolean;
  quote_selections: boolean;
  quote_decided: boolean;
  quote_viewed_again: boolean;
  cold_unopened_days: number;
  cold_unsigned_days: number;
  /** Forecast on the schedule (0119) — morning alert when a work day in the
   * next 3 days newly becomes risky. */
  weather_risk: boolean;
  /** Review requests (0122) — a job ready to ask, and a client opening the review link. */
  review_activity: boolean;
  /** Pre-construction (0124) — required items open close to the start date. */
  precon: boolean;
  /** Maintenance reminders (0127) — due soon, and client service requests. */
  maintenance: boolean;
  /** Timesheets (0131) — submitted / waiting for approval. */
  timesheets: boolean;
  /** Change orders (0150) — the client signs or declines one. */
  change_order_decided: boolean;
}

export const NOTIFICATION_SETTINGS_DEFAULTS: NotificationSettings = {
  quote_first_open: true,
  quote_selections: true,
  quote_decided: true,
  quote_viewed_again: true,
  cold_unopened_days: 3,
  cold_unsigned_days: 5,
  weather_risk: true,
  review_activity: true,
  precon: true,
  maintenance: true,
  timesheets: true,
  change_order_decided: true,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase.from("notification_settings").select("*").maybeSingle();
  if (error || !data) return NOTIFICATION_SETTINGS_DEFAULTS;
  return { ...NOTIFICATION_SETTINGS_DEFAULTS, ...(data as Partial<NotificationSettings>) };
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<void> {
  const current = await getNotificationSettings();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("notification_settings").upsert({ user_id: auth.user?.id, ...current, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export type AutomationTrigger =
  | "quote_viewed"
  | "quote_not_opened"
  | "quote_viewed_not_signed"
  // Review requests (0122)
  | "review_eligible"
  | "review_requested"
  | "review_link_clicked"
  // Pre-construction checklist (0124)
  | "precon_overdue"
  | "precon_ready"
  | "locate_expiring"
  // Maintenance reminders (0127)
  | "maintenance_due"
  | "maintenance_overdue";

export interface AutomationRule {
  id: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  task_title: string;
  task_type: string;
  due_in_days: number;
}

export async function listAutomationRules(): Promise<AutomationRule[]> {
  const { data, error } = await supabase.from("automation_rules").select("*").order("created_at");
  if (error) return [];
  return (data ?? []) as AutomationRule[];
}

export async function saveAutomationRule(rule: Omit<AutomationRule, "id"> & { id?: string }): Promise<void> {
  const row = { trigger: rule.trigger, enabled: rule.enabled, task_title: rule.task_title.trim(), task_type: rule.task_type, due_in_days: rule.due_in_days };
  const { error } = rule.id ? await supabase.from("automation_rules").update(row).eq("id", rule.id) : await supabase.from("automation_rules").insert(row);
  if (error) throw error;
}

export async function deleteAutomationRule(id: string): Promise<void> {
  const { error } = await supabase.from("automation_rules").delete().eq("id", id);
  if (error) throw error;
}

/** "Going cold" automation checks — idempotent; run on app load. */
export async function runQuoteColdChecks(): Promise<number> {
  const { data, error } = await supabase.rpc("run_quote_cold_checks");
  if (error) return 0;
  return Number(data) || 0;
}

// ---------------------------------------------------------------------------
// Crews (0120) — real now (was demo-only). One optional crew per project.
// ---------------------------------------------------------------------------

export interface Crew {
  id: string;
  name: string;
  lead: string | null;
  sort_order: number;
}

export async function listCrews(): Promise<Crew[]> {
  const { data, error } = await supabase.from("crews").select("id, name, lead, sort_order").order("sort_order").order("name");
  if (error) return [];
  return (data ?? []) as Crew[];
}

export async function saveCrew(crew: { id?: string; name: string; lead?: string | null; sort_order?: number }): Promise<Crew> {
  const row = { name: crew.name.trim(), lead: crew.lead?.trim() || null, ...(crew.sort_order != null ? { sort_order: crew.sort_order } : {}) };
  const q = crew.id ? supabase.from("crews").update(row).eq("id", crew.id) : supabase.from("crews").insert(row);
  const { data, error } = await q.select("id, name, lead, sort_order").single();
  if (error) throw error;
  return data as Crew;
}

/** Jobs on this crew fall back to "No crew" (FK on delete set null). */
export async function deleteCrew(id: string): Promise<void> {
  const { error } = await supabase.from("crews").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Schedule delays (0120) — the Rain delay action. The math is
// src/lib/scheduleShift.ts; apply/undo are all-or-nothing RPCs.
// ---------------------------------------------------------------------------

export interface ScheduleDelayChange {
  project_id: string;
  name: string;
  client_name: string | null;
  role: "primary" | "cascade";
  shift_days: number;
  from: { start: string | null; end: string | null };
  to: { start: string | null; end: string | null };
}

export interface ScheduleDelayDelivery {
  order_id: string;
  project_id: string;
  label: string;
  from: string;
  to: string;
}

export interface ScheduleDelay {
  id: string;
  project_id: string;
  delay_date: string;
  days: number;
  reason: "rain" | "weather_other" | "material" | "client" | "other";
  note: string | null;
  mode: "shift" | "extend";
  cascaded: boolean;
  crew_name: string | null;
  changes: ScheduleDelayChange[];
  deliveries: ScheduleDelayDelivery[];
  created_by_name: string | null;
  created_at: string;
  undone_at: string | null;
}

/** A project's delays — as the primary job, or cascaded into by another
 * job's delay (so its history shows why its dates moved). */
export async function listScheduleDelays(projectId?: string): Promise<ScheduleDelay[]> {
  const base = () => supabase.from("schedule_delays").select("*").order("created_at", { ascending: false });
  if (!projectId) {
    const { data, error } = await base();
    return error ? [] : ((data ?? []) as ScheduleDelay[]);
  }
  const [own, cascaded] = await Promise.all([
    base().eq("project_id", projectId),
    base().neq("project_id", projectId).contains("changes", [{ project_id: projectId }]),
  ]);
  if (own.error) return [];
  return [...(own.data ?? []), ...(cascaded.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)) as ScheduleDelay[];
}

export async function applyScheduleDelay(payload: {
  project_id: string;
  project_name: string;
  delay_date: string;
  days: number;
  reason: ScheduleDelay["reason"];
  note: string | null;
  mode: ScheduleDelay["mode"];
  crew_name: string | null;
  changes: ScheduleDelayChange[];
  deliveries: ScheduleDelayDelivery[];
  created_by_name: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("apply_schedule_delay", { p: payload });
  if (error) throw error;
  return data as string;
}

export async function undoScheduleDelay(id: string): Promise<void> {
  const { error } = await supabase.rpc("undo_schedule_delay", { p_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Client heads-up (0121) — message templates + schedule updates. Sending
// goes through src/lib/clientMessaging.ts; template filling is
// src/lib/messageTemplates.ts.
// ---------------------------------------------------------------------------

export interface StoredMessageTemplate {
  key: "rain_delay" | "schedule_change" | "start_confirmed" | "review_request" | "review_reminder";
  subject: string | null;
  body: string;
}

export async function listMessageTemplates(): Promise<StoredMessageTemplate[]> {
  const { data, error } = await supabase.from("message_templates").select("key, subject, body");
  if (error) return [];
  return (data ?? []) as StoredMessageTemplate[];
}

export async function saveMessageTemplate(t: StoredMessageTemplate): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("message_templates")
    .upsert({ user_id: auth.user?.id, key: t.key, subject: t.subject, body: t.body, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
}

/** Back to the built-in default. */
export async function resetMessageTemplate(key: StoredMessageTemplate["key"]): Promise<void> {
  const { error } = await supabase.from("message_templates").delete().eq("key", key);
  if (error) throw error;
}

export type HeadsUpStatus = "pending" | "sent" | "skipped" | "dismissed";

export interface ScheduleUpdate {
  id: string;
  project_id: string;
  client_id: string | null;
  source: "delay" | "manual" | "confirm";
  delay_id: string | null;
  reason: string | null;
  from_start: string | null;
  from_end: string | null;
  to_start: string | null;
  to_end: string | null;
  client_visible: boolean;
  heads_up_status: HeadsUpStatus;
  channel: "text" | "email" | "copy" | null;
  message: string | null;
  sent_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  project?: { name: string } | null;
  client?: { id: string; name: string; phone: string | null; email: string | null } | null;
  delay?: { project_id: string; delay_date: string; days: number } | null;
}

const SCHEDULE_UPDATE_SELECT = "*, project:projects(name), client:clients(id, name, phone, email), delay:schedule_delays(project_id, delay_date, days)";

export async function listScheduleUpdates(filter: { projectId?: string; delayId?: string; ids?: string[]; pendingOnly?: boolean }): Promise<ScheduleUpdate[]> {
  let q = supabase.from("schedule_updates").select(SCHEDULE_UPDATE_SELECT).is("withdrawn_at", null).order("created_at", { ascending: true });
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.delayId) q = q.eq("delay_id", filter.delayId);
  if (filter.ids) q = q.in("id", filter.ids);
  if (filter.pendingOnly) q = q.eq("heads_up_status", "pending");
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as ScheduleUpdate[];
}

export async function updateScheduleUpdate(
  id: string,
  patch: Partial<Pick<ScheduleUpdate, "heads_up_status" | "client_visible" | "message" | "channel" | "sent_at">>,
): Promise<void> {
  const { error } = await supabase.from("schedule_updates").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setScheduleUpdatesClientVisible(ids: string[], visible: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("schedule_updates").update({ client_visible: visible }).in("id", ids);
  if (error) throw error;
}

/** "Confirm start date with client" — a heads-up only (never a Hub post). */
export async function createStartConfirmation(project: Pick<Project, "id" | "client_id" | "scheduled_start_date" | "scheduled_end_date">): Promise<ScheduleUpdate> {
  const { data, error } = await supabase
    .from("schedule_updates")
    .insert({
      project_id: project.id,
      client_id: project.client_id,
      source: "confirm",
      from_start: project.scheduled_start_date,
      from_end: project.scheduled_end_date,
      to_start: project.scheduled_start_date,
      to_end: project.scheduled_end_date,
      client_visible: false,
    })
    .select(SCHEDULE_UPDATE_SELECT)
    .single();
  if (error) throw error;
  return data as ScheduleUpdate;
}

const HEADS_UP_LABEL: Record<StoredMessageTemplate["key"], string> = {
  rain_delay: "Rain delay heads-up",
  schedule_change: "Schedule update",
  start_confirmed: "Start date confirmation",
  review_request: "Review request",
  review_reminder: "Review reminder",
};
const CHANNEL_WORD = { text: "text", email: "email", copy: "a copied message" } as const;

/**
 * "Mark as sent" — the app can't see the send itself (sms:/mailto: hand off
 * to the phone), so the contractor confirms. Logs it in the communication
 * center (activities: text / email / note) and on the project timeline.
 */
export async function markHeadsUpSent(
  u: Pick<ScheduleUpdate, "id" | "project_id" | "client_id">,
  channel: "text" | "email" | "copy",
  message: string,
  template: "rain_delay" | "schedule_change" | "start_confirmed" | "review_request" | "review_reminder",
): Promise<void> {
  await updateScheduleUpdate(u.id, { heads_up_status: "sent", channel, message, sent_at: new Date().toISOString() });
  const label = HEADS_UP_LABEL[template];
  if (u.client_id) {
    await logActivity(u.client_id, channel === "copy" ? "note" : channel, `${label} (${CHANNEL_WORD[channel]}): ${message}`, {
      project_id: u.project_id,
      meta: { schedule_update_id: u.id, heads_up: true, channel },
    });
  }
  await logProjectEvent(u.project_id, "client_heads_up", `${label} sent via ${CHANNEL_WORD[channel]}`, { schedule_update_id: u.id });
}

// ---------------------------------------------------------------------------
// Google review requests (0122). Status math: src/lib/reviews.ts. The
// tracked link /r/{token} goes through review_click() (public).
// ---------------------------------------------------------------------------

export type ReviewSite = "facebook" | "yelp" | "houzz" | "angi";

export interface ReviewSettings {
  enabled: boolean;
  google_url: string | null;
  other_sites: { site: ReviewSite; url: string }[];
  ask_when: "completed" | "paid";
  delay_days: 0 | 1 | 3;
  reminder_days: number;
}

export const REVIEW_SETTINGS_DEFAULTS: ReviewSettings = {
  enabled: true,
  google_url: null,
  other_sites: [],
  ask_when: "completed",
  delay_days: 0,
  reminder_days: 5,
};

export async function getReviewSettings(): Promise<ReviewSettings> {
  const { data, error } = await supabase.from("review_settings").select("*").maybeSingle();
  if (error || !data) return REVIEW_SETTINGS_DEFAULTS;
  return { ...REVIEW_SETTINGS_DEFAULTS, ...data } as ReviewSettings;
}

export async function saveReviewSettings(patch: Partial<ReviewSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("review_settings").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface ReviewRequest {
  id: string;
  project_id: string;
  client_id: string | null;
  token: string;
  status: "not_asked" | "asked" | "clicked" | "left" | "dismissed";
  eligible_at: string | null;
  asked_at: string | null;
  asked_channel: "text" | "email" | "copy" | null;
  reminded_at: string | null;
  reminder_channel: "text" | "email" | "copy" | null;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  click_count: number;
  left_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  project?: { name: string; status: ProjectStatus } | null;
  client?: { id: string; name: string; phone: string | null; email: string | null; no_review_requests: boolean } | null;
}

const REVIEW_SELECT = "*, project:projects(name, status), client:clients(id, name, phone, email, no_review_requests)";

export async function listReviewRequests(): Promise<ReviewRequest[]> {
  const { data, error } = await supabase.from("review_requests").select(REVIEW_SELECT).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ReviewRequest[];
}

export async function getReviewRequest(projectId: string): Promise<ReviewRequest | null> {
  const { data, error } = await supabase.from("review_requests").select(REVIEW_SELECT).eq("project_id", projectId).maybeSingle();
  if (error) return null;
  return data as ReviewRequest | null;
}

export async function updateReviewRequest(
  id: string,
  patch: Partial<Pick<ReviewRequest, "status" | "left_at" | "dismissed_at">>,
): Promise<void> {
  const { error } = await supabase.from("review_requests").update(patch).eq("id", id);
  if (error) throw error;
}

export async function markReviewRequestSent(projectId: string, channel: "text" | "email" | "copy", message: string, reminder: boolean): Promise<void> {
  const { error } = await supabase.rpc("mark_review_request_sent", { p_project_id: projectId, p_channel: channel, p_message: message, p_reminder: reminder });
  if (error) throw error;
}

export async function runReviewChecks(): Promise<number> {
  const { data, error } = await supabase.rpc("run_review_checks");
  if (error) return 0;
  return (data as number) ?? 0;
}

/** The tracked link — logs the click (not for the contractor/team) and
 * returns only the review page URL, or null when the link isn't active. */
export async function reviewClick(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("review_click", { p_token: token });
  if (error) return null;
  return (data as string) ?? null;
}

export async function setClientNoReviewRequests(clientId: string, value: boolean): Promise<void> {
  const { error } = await supabase.from("clients").update({ no_review_requests: value }).eq("id", clientId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Pre-construction checklist (0124). Readiness math: src/lib/precon.ts;
// the per-job data bundle: src/components/precon/usePrecon.ts.
// ---------------------------------------------------------------------------

export interface PreconSettings {
  warn_days: number;
  locate_wait_days: number;
  locate_valid_days: number;
}

export async function getPreconSettings(): Promise<PreconSettings> {
  const { data, error } = await supabase.from("precon_settings").select("warn_days, locate_wait_days, locate_valid_days").maybeSingle();
  if (error || !data) return { warn_days: 5, locate_wait_days: 3, locate_valid_days: 15 };
  return data as PreconSettings;
}

export async function savePreconSettings(patch: Partial<PreconSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("precon_settings").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface PreconTemplateItem {
  id: string;
  key: string;
  label: string;
  kind: PreconItem["kind"];
  required: boolean;
  sort_order: number;
  active: boolean;
}

export async function listPreconTemplate(): Promise<PreconTemplateItem[]> {
  await supabase.rpc("precon_seed_template");
  const { data, error } = await supabase.from("precon_template_items").select("*").order("sort_order");
  if (error) return [];
  return (data ?? []) as PreconTemplateItem[];
}

export async function savePreconTemplateItem(item: Partial<PreconTemplateItem> & { label: string }): Promise<void> {
  if (item.id) {
    const { id, ...patch } = item;
    const { error } = await supabase.from("precon_template_items").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("precon_template_items")
    .insert({ key: `custom:${crypto.randomUUID()}`, kind: "custom", label: item.label.trim(), required: item.required ?? true, sort_order: item.sort_order ?? 999 });
  if (error) throw error;
}

/** System items are turned off (kept for existing jobs); custom ones deleted. */
export async function removePreconTemplateItem(item: Pick<PreconTemplateItem, "id" | "kind">): Promise<void> {
  const q = item.kind === "custom" ? supabase.from("precon_template_items").delete() : supabase.from("precon_template_items").update({ active: false });
  const { error } = await q.eq("id", item.id);
  if (error) throw error;
}

export interface PreconItem {
  id: string;
  project_id: string;
  key: string;
  label: string;
  kind: "quote" | "selections" | "deposit" | "materials" | "deliveries" | "crew" | "start_confirmed" | "hoa" | "permit" | "locate" | "custom";
  required: boolean;
  sort_order: number;
  status: "open" | "done" | "na";
  override: boolean;
  note: string | null;
  details: Record<string, unknown>;
  done_at: string | null;
  removed: boolean;
}

/** A job's checklist — copied from the template on first use. */
export async function listProjectPrecon(projectId: string, ensure = true): Promise<PreconItem[]> {
  if (ensure) await supabase.rpc("precon_ensure_project", { p_project_id: projectId });
  const { data, error } = await supabase.from("project_precon_items").select("*").eq("project_id", projectId).order("sort_order");
  if (error) return [];
  return (data ?? []) as PreconItem[];
}

export async function updatePreconItem(
  id: string,
  patch: Partial<Pick<PreconItem, "status" | "override" | "note" | "details" | "removed" | "label" | "required" | "sort_order">>,
): Promise<void> {
  const full = { ...patch, ...(patch.status ? { done_at: patch.status === "done" ? new Date().toISOString() : null } : {}) };
  const { error } = await supabase.from("project_precon_items").update(full).eq("id", id);
  if (error) throw error;
}

export async function addProjectPreconItem(projectId: string, label: string, required: boolean): Promise<void> {
  const { error } = await supabase
    .from("project_precon_items")
    .insert({ project_id: projectId, key: `custom:${crypto.randomUUID()}`, kind: "custom", label: label.trim(), required, sort_order: 999 });
  if (error) throw error;
}

/** HOA / permit documents and 811 ticket photos — precon/{project}/… */
export async function uploadPreconFile(projectId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 5);
  const path = `precon/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Reminder notification + automation (deduped server-side). */
export async function preconNotify(projectId: string, kind: "overdue" | "ready" | "locate_expiring", title: string, body: string, dedupe: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("precon_notify", { p_project_id: projectId, p_kind: kind, p_title: title, p_body: body, p_dedupe: dedupe });
  if (error) return false;
  return !!data;
}

/** 811 items for these jobs (rain delay preview). */
export async function listLocateItems(projectIds: string[]): Promise<{ project_id: string; details: Record<string, unknown>; status: string }[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("project_precon_items")
    .select("project_id, details, status")
    .eq("kind", "locate")
    .eq("removed", false)
    .in("project_id", projectIds);
  if (error) return [];
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Crew work order (0125) — built ONLY by the crew-facing serializer
// (get_crew_work_order); src/lib/crewSafe.ts whitelists it again here.
// ---------------------------------------------------------------------------

export async function getCrewWorkOrder(projectId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("get_crew_work_order", { p_project_id: projectId });
  if (error) throw error;
  return data;
}

export async function crewWorkOrderOpened(projectId: string, version: string, snapshot: unknown): Promise<void> {
  await supabase.rpc("crew_work_order_opened", { p_project_id: projectId, p_version: version, p_snapshot: snapshot });
}

export async function reviewCrewWorkOrder(projectId: string, version: string): Promise<void> {
  const { error } = await supabase.rpc("crew_review_work_order", { p_project_id: projectId, p_version: version });
  if (error) throw error;
}

export async function crewLogUsage(itemId: string, quantity: number, note: string | null): Promise<void> {
  const { error } = await supabase.rpc("crew_log_usage", { p_item_id: itemId, p_quantity: quantity, p_note: note });
  if (error) throw error;
}

export interface CrewWorkOrderSettings {
  crew_notes: string | null;
  crew_client_notes: string | null;
  crew_note_photos: string[];
  crew_hide_client_phone: boolean;
}

export async function saveCrewWorkOrderSettings(projectId: string, patch: Partial<CrewWorkOrderSettings>): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) throw error;
}

/** Crew-note photos — crew-notes/{project}/… (0125 storage policies). */
export async function uploadCrewNotePhoto(projectId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const path = `crew-notes/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

export async function updateEmployeeCrewRole(id: string, patch: { is_lead?: boolean; can_log_usage?: boolean }): Promise<void> {
  const { error } = await supabase.from("employees").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Progress updates (0126). Helpers: src/lib/progress.ts; uploads go through
// src/lib/uploadQueue.ts (background, with retry).
// ---------------------------------------------------------------------------

export interface ProgressUpdate {
  id: string;
  project_id: string;
  feature_id: string | null;
  milestone: string | null;
  note: string | null;
  author_employee_id: string | null;
  author_name: string | null;
  status: "pending" | "shared" | "internal";
  shared_at: string | null;
  created_at: string;
  project?: { name: string } | null;
  photos?: { id: string; storage_path: string; original_path: string | null }[];
  comments?: { id: string; author: "client" | "contractor"; author_name: string | null; body: string; created_at: string }[];
  liked?: boolean;
}

export async function listProgressUpdates(projectId?: string, status?: ProgressUpdate["status"]): Promise<ProgressUpdate[]> {
  let q = supabase
    .from("progress_updates")
    .select("*, project:projects(name), photos:project_images(id, storage_path, original_path), comments:progress_update_comments(id, author, author_name, body, created_at), reaction:progress_update_reactions(update_id)")
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as (ProgressUpdate & { reaction: unknown })[]).map((u) => ({
    ...u,
    liked: Array.isArray(u.reaction) ? u.reaction.length > 0 : !!u.reaction,
    comments: (u.comments ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/** Owner post (shared or internal). Photos are attached afterwards. */
export async function createProgressUpdate(input: { project_id: string; note: string | null; feature_id: string | null; milestone: string | null }): Promise<ProgressUpdate> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("progress_updates")
    .insert({ ...input, user_id: auth.user?.id, status: "internal", author_name: "You" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProgressUpdate;
}

export async function updateProgressNote(id: string, note: string | null): Promise<void> {
  const { error } = await supabase.from("progress_updates").update({ note }).eq("id", id);
  if (error) throw error;
}

/** Share / unshare — also flips the photos' Client Hub visibility. */
export async function setProgressUpdateShared(id: string, shared: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_progress_update_shared", { p_update_id: id, p_shared: shared });
  if (error) throw error;
}

export async function deleteProgressUpdate(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_progress_update", { p_update_id: id });
  if (error) throw error;
}

/** One photo: the full-size original (contractor only) + a compressed copy
 * (what the Client Hub and the app show). */
export async function addProgressPhoto(projectId: string, updateId: string, file: File, employeeId?: string | null): Promise<void> {
  const base = randomImageFilename(file.name);
  const displayPath = `projects/${projectId}/${base}`;
  const originalPath = `projects/${projectId}/orig-${base.replace(/\.[^.]+$/, "")}.${(file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5)}`;
  const compressed = await compressImageFile(file);
  const up1 = await supabase.storage.from(IMAGES_BUCKET).upload(displayPath, compressed, { contentType: "image/jpeg", upsert: true });
  if (up1.error) throw up1.error;
  const up2 = await supabase.storage.from(IMAGES_BUCKET).upload(originalPath, file, { contentType: file.type || undefined, upsert: true });
  const { error } = await supabase.from("project_images").insert({
    project_id: projectId,
    storage_path: displayPath,
    original_path: up2.error ? null : originalPath,
    progress_update_id: updateId,
    uploaded_by_employee_id: employeeId ?? null,
  });
  if (error) {
    await supabase.storage.from(IMAGES_BUCKET).remove([displayPath, originalPath]);
    throw error;
  }
}

export async function replyToProgressComment(update: Pick<ProgressUpdate, "id" | "project_id">, body: string): Promise<void> {
  const { error } = await supabase
    .from("progress_update_comments")
    .insert({ update_id: update.id, project_id: update.project_id, author: "contractor", author_name: "You", body: body.trim() });
  if (error) throw error;
}

export async function crewPostUpdate(input: { project_id: string; note: string | null; feature_id: string | null; milestone: string | null; share: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc("crew_post_update", {
    p_project_id: input.project_id,
    p_note: input.note,
    p_feature_id: input.feature_id,
    p_milestone: input.milestone,
    p_share: input.share,
  });
  if (error) throw error;
  return data as string;
}

export async function crewFinishUpdate(updateId: string): Promise<void> {
  await supabase.rpc("crew_finish_update", { p_update_id: updateId });
}

export interface ProgressSettings {
  crew_needs_approval: boolean;
  notify_mode: "each" | "daily" | "never";
  milestones: Record<string, string[]>;
}

export async function getProgressSettings(): Promise<ProgressSettings> {
  const { data, error } = await supabase.from("progress_settings").select("crew_needs_approval, notify_mode, milestones").maybeSingle();
  if (error || !data) return { crew_needs_approval: true, notify_mode: "each", milestones: {} };
  return data as ProgressSettings;
}

export async function saveProgressSettings(patch: Partial<ProgressSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("progress_settings").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function markProgressPrompted(projectId: string): Promise<void> {
  await supabase.from("projects").update({ progress_prompted_at: new Date().toISOString() }).eq("id", projectId);
}

export async function setPhotoBeforeAfter(imageId: string, role: "before" | "after" | null, featureId: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_photo_before_after", { p_image_id: imageId, p_role: role, p_feature_id: featureId });
  if (error) throw error;
}

export interface PortfolioItem {
  id: string;
  project_id: string | null;
  feature_id: string | null;
  before_image_id: string | null;
  after_image_id: string | null;
  title: string | null;
  created_at: string;
  project?: { name: string; client?: { name: string; marketing_ok: boolean | null } | null } | null;
  before?: { storage_path: string; original_path: string | null } | null;
  after?: { storage_path: string; original_path: string | null } | null;
}

export async function listPortfolio(): Promise<PortfolioItem[]> {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("*, project:projects(name, client:clients(name, marketing_ok)), before:project_images!portfolio_items_before_image_id_fkey(storage_path, original_path), after:project_images!portfolio_items_after_image_id_fkey(storage_path, original_path)")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as PortfolioItem[];
}

export async function addPortfolioItem(item: { project_id: string; feature_id: string | null; before_image_id: string; after_image_id: string; title: string | null }): Promise<void> {
  const { error } = await supabase.from("portfolio_items").insert(item);
  if (error) throw error;
}

export async function removePortfolioItem(id: string): Promise<void> {
  const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
  if (error) throw error;
}

export async function setClientMarketingOk(clientId: string, ok: boolean | null): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ marketing_ok: ok, marketing_ok_at: ok == null ? null : new Date().toISOString(), marketing_ok_source: ok == null ? null : "manual" })
    .eq("id", clientId);
  if (error) throw error;
}

export async function getClientMarketingOk(clientId: string): Promise<boolean | null> {
  const { data } = await supabase.from("clients").select("marketing_ok").eq("id", clientId).maybeSingle();
  return (data?.marketing_ok as boolean | null) ?? null;
}

// ---------------------------------------------------------------------------
// Maintenance reminders (0127). Math: src/lib/maintenance.ts.
// ---------------------------------------------------------------------------

export interface MaintenanceTemplate {
  id: string;
  build_type: string;
  label: string;
  description: string | null;
  interval_months: number | null;
  interval_months_max: number | null;
  as_needed: boolean;
  remind_month: number | null;
  sort_order: number;
  active: boolean;
}

export async function listMaintenanceTemplates(): Promise<MaintenanceTemplate[]> {
  await supabase.rpc("maintenance_seed_templates");
  const { data, error } = await supabase.from("maintenance_templates").select("*").order("build_type").order("sort_order");
  if (error) return [];
  return (data ?? []) as MaintenanceTemplate[];
}

export async function saveMaintenanceTemplate(t: Partial<MaintenanceTemplate> & { build_type: string; label: string }): Promise<void> {
  const { id, ...row } = t;
  const q = id ? supabase.from("maintenance_templates").update(row).eq("id", id) : supabase.from("maintenance_templates").insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteMaintenanceTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("maintenance_templates").delete().eq("id", id);
  if (error) throw error;
}

export interface MaintenanceSettings {
  lead_days: number;
  warranties: Record<string, number>;
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  const { data, error } = await supabase.from("maintenance_settings").select("lead_days, warranties").maybeSingle();
  if (error || !data) return { lead_days: 30, warranties: {} };
  return data as MaintenanceSettings;
}

export async function saveMaintenanceSettings(patch: Partial<MaintenanceSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("maintenance_settings").upsert({ user_id: auth.user?.id, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface MaintenanceItem {
  id: string;
  project_id: string;
  feature_id: string | null;
  template_id: string | null;
  label: string;
  description: string | null;
  interval_months: number | null;
  as_needed: boolean;
  remind_month: number | null;
  next_due: string | null;
  snoozed_until: string | null;
  status: "active" | "stopped";
  opportunity_id: string | null;
  last_done_on: string | null;
  created_at: string;
  project?: { name: string; status: ProjectStatus; completed_at: string | null; client_id: string | null; client?: { name: string; phone: string | null; email: string | null; maintenance_opt_out: boolean } | null } | null;
  events?: { id: string; kind: string; note: string | null; created_at: string }[];
}

const MAINT_SELECT = "*, project:projects(name, status, completed_at, client_id, client:clients(name, phone, email, maintenance_opt_out)), events:maintenance_events(id, kind, note, created_at)";

export async function listMaintenanceItems(projectId?: string): Promise<MaintenanceItem[]> {
  let q = supabase.from("project_maintenance_items").select(MAINT_SELECT).order("next_due", { ascending: true, nullsFirst: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as MaintenanceItem[]).map((i) => ({ ...i, events: (i.events ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)) }));
}

/** The completion step's confirm: items + warranty end dates. */
export async function createMaintenanceItems(
  projectId: string,
  items: { feature_id: string | null; template_id: string | null; label: string; description: string | null; interval_months: number | null; as_needed: boolean; remind_month: number | null; next_due: string | null }[],
  warranties: { feature_id: string; ends_on: string | null }[],
): Promise<void> {
  if (items.length) {
    const { data, error } = await supabase
      .from("project_maintenance_items")
      .insert(items.map((i) => ({ ...i, project_id: projectId })))
      .select("id");
    if (error) throw error;
    await supabase.from("maintenance_events").insert((data ?? []).map((r) => ({ item_id: r.id, kind: "set_up" })));
  }
  for (const w of warranties) {
    await supabase.from("project_features").update({ warranty_ends_on: w.ends_on }).eq("id", w.feature_id);
  }
}

export async function updateMaintenanceItem(
  id: string,
  patch: Partial<Pick<MaintenanceItem, "next_due" | "snoozed_until" | "status" | "last_done_on" | "opportunity_id" | "label" | "description">>,
): Promise<void> {
  const { error } = await supabase.from("project_maintenance_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function addMaintenanceEvent(itemId: string, kind: "reached_out" | "snoozed" | "skipped" | "done" | "stopped", note: string | null = null): Promise<void> {
  await supabase.from("maintenance_events").insert({ item_id: itemId, kind, note });
}

export async function createMaintenanceOpportunity(projectId: string, itemIds: string[] | null): Promise<string> {
  const { data, error } = await supabase.rpc("create_maintenance_opportunity", { p_project_id: projectId, p_item_ids: itemIds });
  if (error) throw error;
  return data as string;
}

export async function dismissMaintenanceSetup(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").update({ maintenance_dismissed: true }).eq("id", projectId);
  if (error) throw error;
}

export async function runMaintenanceChecksRpc(): Promise<number> {
  const { data, error } = await supabase.rpc("run_maintenance_checks");
  if (error) return 0;
  return (data as number) ?? 0;
}

/** Warranty end per feature (0127) — separate from listProjectFeatures so
 * that stays working before the migration. */
export async function listFeatureWarranties(projectId: string): Promise<{ id: string; warranty_ends_on: string }[]> {
  const { data, error } = await supabase
    .from("project_features")
    .select("id, warranty_ends_on")
    .eq("project_id", projectId)
    .neq("status", "removed")
    .not("warranty_ends_on", "is", null);
  if (error) return [];
  return (data ?? []) as { id: string; warranty_ends_on: string }[];
}

// ---------------------------------------------------------------------------
// Marketing ROI (0128) — ad spend by lead source and month. Math:
// src/lib/marketingRoi.ts. Reporting only; never touches job costs.
// ---------------------------------------------------------------------------

export interface LeadSourceSpend {
  id: string;
  lead_source: string;
  month: string; // YYYY-MM-01
  amount: number;
  note: string | null;
}

export async function listLeadSourceSpend(): Promise<LeadSourceSpend[]> {
  const { data, error } = await supabase.from("lead_source_spend").select("id, lead_source, month, amount, note").order("month");
  if (error) return [];
  return ((data ?? []) as LeadSourceSpend[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Upserts by (source, month); an empty amount (null) deletes that month. */
export async function saveLeadSourceSpend(rows: { lead_source: string; month: string; amount: number | null; note?: string | null }[]): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const upserts = rows.filter((r) => r.amount != null).map((r) => ({ user_id: uid, lead_source: r.lead_source, month: r.month, amount: r.amount, note: r.note?.trim() || null }));
  if (upserts.length) {
    const { error } = await supabase.from("lead_source_spend").upsert(upserts, { onConflict: "user_id,lead_source,month" });
    if (error) throw error;
  }
  for (const r of rows.filter((x) => x.amount == null)) {
    const { error } = await supabase.from("lead_source_spend").delete().eq("lead_source", r.lead_source).eq("month", r.month);
    if (error) throw error;
  }
}

export interface MarketingSettings {
  roas_good: number;
  roas_min: number;
  profit_good: number;
  profit_min: number;
}

export async function getMarketingSettings(): Promise<MarketingSettings> {
  const { data, error } = await supabase.from("marketing_settings").select("roas_good, roas_min, profit_good, profit_min").maybeSingle();
  if (error || !data) return { roas_good: 5, roas_min: 2, profit_good: 2, profit_min: 1 };
  return { roas_good: Number(data.roas_good), roas_min: Number(data.roas_min), profit_good: Number(data.profit_good), profit_min: Number(data.profit_min) };
}

export async function saveMarketingSettings(s: MarketingSettings): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("marketing_settings").upsert({ user_id: auth.user?.id, ...s }, { onConflict: "user_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Timesheets + payroll (0131). Hours / overtime / cost are computed in the
// DB (_recompute_workweek); src/lib/timesheets.ts reads them. Pay rates are
// owner-only; employees go through the time_* / my_timesheet RPCs, which
// never return a rate or a cost.
// ---------------------------------------------------------------------------

export type TimesheetStatus = "not_submitted" | "submitted" | "approved" | "rejected";

export interface PayrollSettings {
  period_type: "weekly" | "biweekly" | "semimonthly";
  week_start: number;
  biweekly_anchor: string | null;
  ot_weekly_hours: number;
  ot_daily_hours: number | null;
  ot_multiplier: number;
  burden_pct: number;
  rounding_minutes: 0 | 5 | 15;
  lunch_enabled: boolean;
  lunch_after_hours: number;
  lunch_minutes: number;
  long_day_hours: number;
}

export const PAYROLL_DEFAULTS: PayrollSettings = {
  period_type: "weekly",
  week_start: 1,
  biweekly_anchor: null,
  ot_weekly_hours: 40,
  ot_daily_hours: null,
  ot_multiplier: 1.5,
  burden_pct: 0,
  rounding_minutes: 0,
  lunch_enabled: false,
  lunch_after_hours: 6,
  lunch_minutes: 30,
  long_day_hours: 12,
};

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const { data, error } = await supabase.from("payroll_settings").select("*").maybeSingle();
  if (error || !data) return PAYROLL_DEFAULTS;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...PAYROLL_DEFAULTS,
    ...data,
    ot_weekly_hours: Number(data.ot_weekly_hours),
    ot_daily_hours: n(data.ot_daily_hours),
    ot_multiplier: Number(data.ot_multiplier),
    burden_pct: Number(data.burden_pct),
    lunch_after_hours: Number(data.lunch_after_hours),
    long_day_hours: Number(data.long_day_hours),
  } as PayrollSettings;
}

export async function savePayrollSettings(s: PayrollSettings): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("payroll_settings").upsert({ user_id: auth.user?.id, ...s }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface PayRate {
  id: string;
  employee_id: string;
  rate: number;
  effective_date: string;
  note: string | null;
  created_at: string;
}

export async function listPayRates(): Promise<PayRate[]> {
  const { data, error } = await supabase.from("employee_pay_rates").select("*").order("effective_date", { ascending: false });
  if (error) return [];
  return ((data ?? []) as PayRate[]).map((r) => ({ ...r, rate: Number(r.rate) }));
}

/** The rate in effect for an employee on a date (history kept; newest first). */
export function rateOn(rates: PayRate[], employeeId: string, date: string): number | null {
  const r = rates.filter((x) => x.employee_id === employeeId && x.effective_date <= date).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  return r ? r.rate : null;
}

export async function addPayRate(input: { employee_id: string; rate: number; effective_date: string; note?: string | null }): Promise<void> {
  const { error } = await supabase
    .from("employee_pay_rates")
    .upsert({ ...input, note: input.note?.trim() || null }, { onConflict: "employee_id,effective_date" });
  if (error) throw error;
}

export async function deletePayRate(id: string): Promise<void> {
  const { error } = await supabase.from("employee_pay_rates").delete().eq("id", id);
  if (error) throw error;
}

export async function payPeriodFor(date: string): Promise<{ period_start: string; period_end: string }> {
  const { data, error } = await supabase.rpc("pay_period_for", { p_date: date });
  if (error) throw error;
  return data as { period_start: string; period_end: string };
}

export interface TimesheetEntry extends LaborEntry {
  project?: { name: string } | null;
}

export interface Timesheet {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  status: TimesheetStatus;
  flag_notes: Record<string, string>;
  employee_note: string | null;
  reject_comment: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  employee?: { name: string; email: string } | null;
  entries?: TimesheetEntry[];
}

const TS_SELECT = "*, employee:employees(name, email), entries:labor_entries(*, project:projects(name))";

export async function listTimesheets(periodStart: string): Promise<Timesheet[]> {
  const { data, error } = await supabase.from("timesheets").select(TS_SELECT).eq("period_start", periodStart);
  if (error) return [];
  return (data ?? []) as Timesheet[];
}

export async function getTimesheet(id: string): Promise<Timesheet | null> {
  const { data, error } = await supabase.from("timesheets").select(TS_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Timesheet | null;
}

export interface TimesheetEvent {
  id: string;
  actor: string | null;
  kind: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  comment: string | null;
  created_at: string;
}

export async function listTimesheetEvents(timesheetId: string): Promise<TimesheetEvent[]> {
  const { data, error } = await supabase.from("timesheet_events").select("*").eq("timesheet_id", timesheetId).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as TimesheetEvent[];
}

/** Rain-delay days (0120) inside a range, for the "time on a rained-out day" flag. */
export async function listRainDays(from: string, to: string): Promise<{ project_id: string; date: string }[]> {
  const { data, error } = await supabase.from("schedule_delays").select("project_id, delay_date, days").eq("reason", "rain").is("undone_at", null);
  if (error) return [];
  const out: { project_id: string; date: string }[] = [];
  for (const d of (data ?? []) as { project_id: string; delay_date: string; days: number }[]) {
    for (let i = 0; i < d.days; i++) {
      const [y, m, dd] = d.delay_date.split("-").map(Number);
      const x = new Date(y, m - 1, dd + i);
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      if (iso >= from && iso <= to) out.push({ project_id: d.project_id, date: iso });
    }
  }
  return out;
}

async function rpcVoid(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}
export const approveTimesheet = (id: string) => rpcVoid("approve_timesheet", { p_id: id });
export const rejectTimesheet = (id: string, comment: string) => rpcVoid("reject_timesheet", { p_id: id, p_comment: comment });
export const unlockTimesheet = (id: string, reason: string) => rpcVoid("unlock_timesheet", { p_id: id, p_reason: reason });
export const markPayPeriod = (periodStart: string, exported: boolean, paidOn: string | null) =>
  rpcVoid("mark_pay_period", { p_period_start: periodStart, p_exported: exported, p_paid_on: paidOn });

export interface PayPeriodRow {
  period_start: string;
  period_end: string;
  exported_at: string | null;
  paid_on: string | null;
}
export async function getPayPeriod(periodStart: string): Promise<PayPeriodRow | null> {
  const { data } = await supabase.from("pay_periods").select("period_start, period_end, exported_at, paid_on").eq("period_start", periodStart).maybeSingle();
  return (data as PayPeriodRow | null) ?? null;
}

export async function runTimesheetReminders(): Promise<number> {
  const { data, error } = await supabase.rpc("run_timesheet_reminders");
  if (error) return 0;
  return (data as number) ?? 0;
}

// --- Employee side (own time only) -------------------------------------

export interface MyTimeEntry {
  id: string;
  project_id: string;
  project: string;
  entry_date: string;
  start_at: string | null;
  end_at: string | null;
  break_minutes: number;
  hours: number;
  reg_hours: number | null;
  ot_hours: number | null;
  note: string | null;
  source: string;
}

export interface MyTimesheet {
  period_start: string;
  period_end: string;
  status: TimesheetStatus;
  reject_comment: string | null;
  flag_notes: Record<string, string>;
  locked: boolean;
  previous: { period_start: string; period_end: string; status: TimesheetStatus } | null;
  settings: { ot_weekly_hours: number; ot_daily_hours: number | null; long_day_hours: number; week_start: number };
  entries: MyTimeEntry[];
  running: { id: string; project_id: string; project: string; start_at: string } | null;
  projects: { id: string; name: string }[];
  rain_days: { project_id: string; date: string }[];
}

export async function getMyTimesheet(date: string): Promise<MyTimesheet> {
  const { data, error } = await supabase.rpc("my_timesheet", { p_date: date });
  if (error) throw error;
  return data as MyTimesheet;
}
export const clockIn = (projectId: string, localDate: string) => rpcVoid("time_clock_in", { p_project_id: projectId, p_local_date: localDate });
export const clockOut = (breakMinutes: number, note: string | null) => rpcVoid("time_clock_out", { p_break_minutes: breakMinutes, p_note: note });
export async function saveMyTimeEntry(input: { id: string | null; project_id: string; date: string; start_at: string; end_at: string | null; break_minutes: number; note: string | null }): Promise<void> {
  await rpcVoid("time_save_entry", {
    p_id: input.id,
    p_project_id: input.project_id,
    p_date: input.date,
    p_start: input.start_at,
    p_end: input.end_at,
    p_break_minutes: input.break_minutes,
    p_note: input.note,
  });
}
export const deleteMyTimeEntry = (id: string) => rpcVoid("time_delete_entry", { p_id: id });
export const submitMyWeek = (date: string, flagNotes: Record<string, string>, note: string | null) =>
  rpcVoid("time_submit_week", { p_date: date, p_flag_notes: flagNotes, p_note: note });

/** Owner add / edit of a timed entry on someone's timesheet (logged by the DB trigger). */
export async function ownerSaveTimeEntry(input: {
  id: string | null;
  employee_id: string;
  worker_name: string;
  project_id: string;
  date: string;
  start_at: string;
  end_at: string | null;
  break_minutes: number;
  note: string | null;
}): Promise<void> {
  const row = {
    project_id: input.project_id,
    entry_date: input.date,
    start_at: input.start_at,
    end_at: input.end_at,
    break_minutes: input.break_minutes,
    note: input.note,
  };
  const { error } = input.id
    ? await supabase.from("labor_entries").update(row).eq("id", input.id)
    : await supabase.from("labor_entries").insert({ ...row, employee_id: input.employee_id, worker_name: input.worker_name, source: "owner", hours: 0, cost: 0 });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Business health (0132) — settings for capacity + forecast. Every read
// falls back to defaults before the migration runs. Math:
// src/lib/businessHealth.ts.
// ---------------------------------------------------------------------------

export interface BusinessHealthSettings {
  invoice_due_days: number;
  stage_probabilities: Record<string, number>;
}

export async function getBusinessHealthSettings(): Promise<BusinessHealthSettings> {
  const { DEFAULT_STAGE_PROBABILITIES } = await import("./businessHealth");
  const { data, error } = await supabase.from("business_health_settings").select("invoice_due_days, stage_probabilities").maybeSingle();
  if (error || !data) return { invoice_due_days: 14, stage_probabilities: DEFAULT_STAGE_PROBABILITIES };
  return { invoice_due_days: Number(data.invoice_due_days), stage_probabilities: { ...DEFAULT_STAGE_PROBABILITIES, ...(data.stage_probabilities ?? {}) } };
}

export async function saveBusinessHealthSettings(s: BusinessHealthSettings): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("business_health_settings").upsert({ user_id: auth.user?.id, ...s }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}
export async function listHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase.from("holidays").select("id, date, name").order("date");
  if (error) return [];
  return (data ?? []) as Holiday[];
}
export async function addHoliday(date: string, name: string): Promise<void> {
  const { error } = await supabase.from("holidays").upsert({ date, name: name.trim() || "Holiday" }, { onConflict: "user_id,date" });
  if (error) throw error;
}
export async function deleteHoliday(id: string): Promise<void> {
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) throw error;
}

/** Crews with their working weekdays (0132); Mon–Fri before the migration. */
export async function listCrewsWithWorkDays(): Promise<(Crew & { work_days: number[] })[]> {
  const { data, error } = await supabase.from("crews").select("id, name, lead, sort_order, work_days").order("sort_order").order("name");
  if (!error) return (data ?? []) as (Crew & { work_days: number[] })[];
  return (await listCrews()).map((c) => ({ ...c, work_days: [1, 2, 3, 4, 5] }));
}
export async function setCrewWorkDays(crewId: string, workDays: number[]): Promise<void> {
  const { error } = await supabase.from("crews").update({ work_days: [...workDays].sort() }).eq("id", crewId);
  if (error) throw error;
}

/** Labor entries across all jobs since a date, with their timesheet status (payroll run-rate). */
export async function listLaborEntriesSince(date: string): Promise<LaborEntry[]> {
  const { data, error } = await supabase.from("labor_entries").select("*, timesheet:timesheets(status)").gte("entry_date", date);
  if (error) return [];
  return (data ?? []) as LaborEntry[];
}

// ---------------------------------------------------------------------------
// Dashboard refresh — read-only lists over existing tables (no new data).
// ---------------------------------------------------------------------------

/** Client change requests on approved selections (0115) still open, across all jobs. */
export async function listOpenSelectionChangeRequests(): Promise<{ id: string; project_id: string | null; note: string | null; created_at: string; requested_by: string | null; project: { name: string } | null }[]> {
  const { data, error } = await supabase
    .from("selection_change_requests")
    .select("id, project_id, note, created_at, requested_by, project:projects(name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as never;
}

/** Timesheets submitted and waiting for approval (0131). */
export async function listSubmittedTimesheets(): Promise<{ id: string; employee_id: string; period_start: string; submitted_at: string | null; employee: { name: string } | null }[]> {
  const { data, error } = await supabase.from("timesheets").select("id, employee_id, period_start, submitted_at, employee:employees(name)").eq("status", "submitted");
  if (error) return [];
  return (data ?? []) as never;
}

/** Who's clocked in right now (a timer with no end, 0131). */
export async function listRunningTimers(): Promise<{ id: string; employee_id: string; project_id: string; start_at: string; worker_name: string | null; project: { name: string } | null }[]> {
  const { data, error } = await supabase
    .from("labor_entries")
    .select("id, employee_id, project_id, start_at, worker_name, project:projects(name)")
    .not("start_at", "is", null)
    .is("end_at", null);
  if (error) return [];
  return (data ?? []) as never;
}

/** Contractor-side approval (0133) — same downstream effects as a client approving in the Client Hub. */
export async function contractorApproveQuote(input: { quoteId: string; method: "in_person" | "paper" | "other"; note: string | null; signedBy: string | null; approvedOn: string; recordedBy: string }): Promise<void> {
  const { error } = await supabase.rpc("contractor_approve_quote", {
    p_quote_id: input.quoteId,
    p_method: input.method,
    p_note: input.note,
    p_signed_by: input.signedBy,
    p_approved_on: input.approvedOn,
    p_recorded_by: input.recordedBy,
  });
  if (error) throw error;
}
