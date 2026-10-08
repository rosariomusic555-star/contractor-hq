/* =============================================================================
 * The crew-facing serializer (0125). The work order is built on the server
 * by crew_work_order_json() field by field; everything the app receives
 * passes through here again, so an extra column added to the function
 * can't slip through by accident. src/lib/crewSafe.test.ts fails if any
 * money or internal field appears anywhere in a work order.
 *
 * Never on the list: prices, unit costs, totals, amounts, margins, overhead,
 * labor rates / cost, payments, balances, internal notes.
 * ========================================================================== */

export const CREW_FIELDS = {
  root: ["project", "site", "permits", "locate_rules", "client", "crew_notes", "features", "general_scope", "materials", "deliveries", "photos", "delays", "attachments", "updated_at", "version", "viewer", "last_open", "reviews", "possible_subs"],
  project: ["id", "name", "status", "address", "scheduled_start_date", "scheduled_end_date", "actual_start_date", "crew_name"],
  site: ["conditions", "slope", "access", "soil", "demo"],
  permit: ["kind", "label", "status", "ticket", "submitted", "permit_status", "number", "date"],
  locateRules: ["wait_days", "valid_days"],
  client: ["name", "phone", "notes_for_crew"],
  crewNotes: ["text", "photos"],
  feature: ["id", "label", "category", "measurements", "selections", "scope", "labor", "changes"],
  measurement: ["id", "build_type", "label", "data", "totals"],
  selection: ["group", "choices"],
  scopeItem: ["name", "description", "quantity", "unit"],
  labor: ["crew_days", "crew_size", "man_hours"],
  change: ["number", "title", "approved_at", "scope_note", "items"],
  material: ["id", "feature_id", "section", "name", "color", "product", "quantity", "unit", "waste_percent", "planned_quantity", "conversion_factor", "conversion_unit", "tracked", "orders", "used", "description", "missing_color"],
  materialOrder: ["quantity", "unit", "status", "expected_date", "fulfillment", "supplier"],
  delivery: ["id", "supplier", "expected_date", "status", "delivered_on", "fulfillment", "note", "items", "photos"],
  photo: ["id", "storage_path", "caption"],
  delay: ["date", "days", "reason"],
  // 0154 — work order attachments (site plans, drawings, spec sheets…).
  attachment: [
    "id", "feature_id", "title", "note", "category", "pinned", "sort_order", "storage_path", "mime_type",
    "size_bytes", "width", "height", "page_count", "version", "marked_up_from", "added_by_crew", "added_by_name", "updated_at",
  ],
  viewer: ["is_owner", "employee_id", "is_lead", "can_log_usage"],
  lastOpen: ["version", "snapshot", "opened_at"],
  review: ["name", "version", "reviewed_at"],
  // 0157 — possible subcontracted work from the opportunity (info only).
  possibleSub: ["label", "note", "type"],
} as const;

/** Must never reach a crew. */
export const CREW_FORBIDDEN_FIELDS = [
  "price", "unit_price", "unit_cost", "cost", "costs", "line_cost", "amount", "total", "subtotal", "contract_value",
  "margin", "margin_pct", "target_margin_pct", "markup", "overhead", "overhead_rate", "burden", "break_even",
  "labor_rate", "labor_cost", "hourly_rate", "default_hourly_rate", "labor_lump_sum", "payments", "payment", "balance",
  "received", "amount_paid", "deposit_percentage", "invoice_number", "notes", "internal_notes", "user_id", "share_token",
  "email", "profit", "price_delta", "cost_delta", "approved_price",
] as const;

type Row = Record<string, unknown>;

function pick(obj: unknown, fields: readonly string[], nested: Record<string, (v: unknown) => unknown> = {}): Row | null {
  if (!obj || typeof obj !== "object") return null;
  const out: Row = {};
  for (const f of fields) {
    if (!(f in (obj as Row))) continue;
    const v = (obj as Row)[f];
    out[f] = nested[f] && v != null ? nested[f](v) : v;
  }
  return out;
}
const list = (fn: (v: unknown) => unknown) => (v: unknown) => (Array.isArray(v) ? v.map(fn) : []);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** Measurement `data` / `totals` are geometry (feet, sq ft, counts) — keep
 * only plain numbers / strings / booleans / nested shapes of them, and drop
 * any key that looks like money, just in case. */
function geometry(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(geometry);
  if (v && typeof v === "object") {
    const out: Row = {};
    for (const [k, x] of Object.entries(v)) {
      if ((CREW_FORBIDDEN_FIELDS as readonly string[]).includes(k) || /price|cost|rate|amount|margin/i.test(k)) continue;
      out[k] = geometry(x);
    }
    return out;
  }
  return v;
}

export function crewSafeWorkOrder(raw: unknown): CrewWorkOrder | null {
  const r = raw as Row | null;
  if (!r || typeof r !== "object" || !r.project) return null;
  return pick(r, CREW_FIELDS.root, {
    project: (v) => pick(v, CREW_FIELDS.project),
    site: (v) => pick(v, CREW_FIELDS.site),
    permits: list((v) => pick(v, CREW_FIELDS.permit)),
    locate_rules: (v) => pick(v, CREW_FIELDS.locateRules),
    client: (v) => pick(v, CREW_FIELDS.client),
    crew_notes: (v) => pick(v, CREW_FIELDS.crewNotes, { photos: strings }),
    features: list((f) =>
      pick(f, CREW_FIELDS.feature, {
        measurements: list((m) => pick(m, CREW_FIELDS.measurement, { data: geometry, totals: geometry })),
        selections: list((s) => pick(s, CREW_FIELDS.selection, { choices: strings })),
        scope: list((s) => pick(s, CREW_FIELDS.scopeItem)),
        labor: (v) => pick(v, CREW_FIELDS.labor),
        changes: list((c) => pick(c, CREW_FIELDS.change, { items: list((i) => pick(i, CREW_FIELDS.scopeItem)) })),
      }),
    ),
    general_scope: list((s) => pick(s, CREW_FIELDS.scopeItem)),
    materials: list((m) => pick(m, CREW_FIELDS.material, { orders: list((o) => pick(o, CREW_FIELDS.materialOrder)) })),
    deliveries: list((d) => pick(d, CREW_FIELDS.delivery, { photos: list((p) => pick(p, CREW_FIELDS.photo)) })),
    photos: list((p) => pick(p, CREW_FIELDS.photo)),
    delays: list((d) => pick(d, CREW_FIELDS.delay)),
    attachments: list((a) => pick(a, CREW_FIELDS.attachment)),
    viewer: (v) => pick(v, CREW_FIELDS.viewer),
    last_open: (v) => pick(v, CREW_FIELDS.lastOpen, { snapshot: (s) => crewSafeWorkOrder(s) }),
    reviews: list((v) => pick(v, CREW_FIELDS.review)),
    possible_subs: list((v) => pick(v, CREW_FIELDS.possibleSub)),
  }) as unknown as CrewWorkOrder;
}

export type DeliveryIssue = "short" | "damaged" | "wrong_item" | "backordered";

export interface CrewScopeItem {
  name: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface CrewFeature {
  id: string;
  label: string;
  category: string | null;
  measurements: { id: string; build_type: string; label: string | null; data: Record<string, unknown>; totals: Record<string, unknown> }[];
  selections: { group: string; choices: string[] }[];
  scope: CrewScopeItem[];
  labor: { crew_days: number | null; crew_size: number | null; man_hours: number | null } | null;
  changes: { number: number | null; title: string; approved_at: string | null; scope_note: string | null; items: CrewScopeItem[] }[];
}

export interface CrewMaterial {
  id: string;
  feature_id: string | null;
  section: string;
  name: string;
  color: string | null;
  product: string | null;
  /** 0162 — the line's description (specs / notes). Present only when set. */
  description?: string | null;
  /** 0162 — its category asks for a color and it has none. Present only then. */
  missing_color?: boolean;
  quantity: number;
  unit: string | null;
  waste_percent: number | null;
  planned_quantity: number;
  conversion_factor: number | null;
  conversion_unit: string | null;
  tracked: boolean;
  orders: {
    quantity: number;
    unit: string | null;
    status: string;
    expected_date: string | null;
    /** 0168 — how it gets to site, and from whom (paid purchases only). */
    fulfillment?: "delivery" | "pickup";
    supplier?: string | null;
  }[];
  /** Logged as used so far, in the line's unit (0145; absent before it). */
  used?: number;
}

export interface CrewAttachment {
  id: string;
  /** null = the whole project. */
  feature_id: string | null;
  title: string;
  note: string | null;
  category: "site_plan" | "layout" | "photo" | "spec_sheet" | "permit_hoa" | "other";
  pinned: boolean;
  sort_order: number;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  page_count: number | null;
  version: number;
  marked_up_from: string | null;
  added_by_crew: boolean;
  added_by_name: string | null;
  updated_at: string;
}

export interface CrewWorkOrder {
  project: {
    id: string;
    name: string;
    status: string;
    address: string | null;
    scheduled_start_date: string | null;
    scheduled_end_date: string | null;
    actual_start_date: string | null;
    crew_name: string | null;
  };
  site: { conditions: string | null; slope: string | null; access: string | null; soil: string | null; demo: string | null };
  permits: { kind: "locate" | "permit" | "hoa"; label: string; status: string; ticket: string | null; submitted: string | null; permit_status: string | null; number: string | null; date: string | null }[];
  locate_rules: { wait_days: number; valid_days: number };
  client: { name: string | null; phone: string | null; notes_for_crew: string | null };
  crew_notes: { text: string | null; photos: string[] };
  features: CrewFeature[];
  general_scope: CrewScopeItem[];
  materials: CrewMaterial[];
  deliveries: {
    id: string;
    supplier: string | null;
    expected_date: string | null;
    status: string;
    /** 0152: every delivery now (not just pending), with its photos. */
    delivered_on?: string | null;
    /** 0168 — each paid supplier purchase: Delivery or Pickup, its note and items. */
    fulfillment?: "delivery" | "pickup";
    note?: string | null;
    items?: string[];
    photos?: { id: string; storage_path: string; caption: string | null }[];
  }[];
  photos: { id: string; storage_path: string; caption: string | null }[];
  delays: { date: string; days: number; reason: string }[];
  /** 0154; absent on a copy saved before it. */
  attachments?: CrewAttachment[];
  updated_at: string | null;
  version: string;
  viewer: { is_owner: boolean; employee_id: string | null; is_lead: boolean; can_log_usage: boolean };
  last_open: { version: string; snapshot: CrewWorkOrder | null; opened_at: string } | null;
  reviews: { name: string; version: string; reviewed_at: string }[];
  /** 0157; absent before it. Info only — never a price. */
  possible_subs?: { label: string; note: string | null; type: string | null }[];
}

/** Every key anywhere in a value — the test's leak detector. */
export function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}
