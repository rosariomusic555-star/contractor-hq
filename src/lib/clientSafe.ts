import type {
  PortalApproval,
  PortalChangeOrder,
  PortalInvoice,
  PortalPayment,
  PortalProjectDetail,
  PortalQuote,
  PortalVersion,
} from "./portalApi";

/**
 * The client-facing serializer (0113). The whitelist below lists EXACTLY
 * which fields can reach the Client Hub, the public share links and the
 * client PDFs (project summary, receipts). The database builds these
 * objects field by field in the client_*_json SQL functions; everything the
 * app receives for a client passes through here again, so an extra column
 * added to an RPC can't slip through by accident.
 *
 * Never on the list: cost, profit, margin, overhead / burden, break-even,
 * labor cost / hours, Cost plan data, supplier costs, internal notes, or
 * internal ids. src/lib/clientSafe.test.ts fails if any of those appear.
 */
export const CLIENT_FIELDS = {
  project: ["id", "name", "status", "address", "scheduled_start_date", "scheduled_end_date", "actual_start_date", "actual_end_date"],
  business: ["company_name", "phone", "email", "address", "license", "logo_url"],
  client: ["name"],
  approval: ["name", "at", "ip", "comment"],
  image: ["id", "storage_path"],
  quote: [
    "id", "kind", "addon_number", "status", "deposit_percentage", "notes", "terms",
    "signed_at", "signed_by", "declined_at", "decline_comment", "created_at", "updated_at", "total", "approval", "sections",
  ],
  quoteSection: ["id", "name", "is_optional", "sort_order", "items", "selections"],
  selectionGroup: ["id", "name", "help_text", "required", "multi", "approved_at", "options", "picked", "history"],
  selectionOption: ["id", "name", "description", "image_path", "price_delta", "is_default"],
  selectionHistory: ["source", "option_names", "created_at", "change_order_number"],
  quoteItem: ["id", "name", "description", "price", "quantity", "unit", "is_optional", "client_selected", "sort_order", "images"],
  changeOrder: [
    "id", "number", "title", "description", "reason", "amount", "status", "schedule_impact_days",
    "signed_at", "signed_by", "approved_at", "approved_by", "declined_at", "decline_comment", "created_at", "total", "approval", "sections",
  ],
  changeOrderSection: ["id", "name", "sort_order", "scope_note", "items"],
  changeOrderItem: ["id", "name", "description", "price", "quantity", "unit", "sort_order", "images"],
  invoice: ["id", "invoice_number", "amount", "amount_paid", "status", "due_date", "notes", "paid_at", "created_at", "updated_at", "total", "items"],
  invoiceItem: ["description", "quantity", "unit_price"],
  payment: ["token", "receipt_number", "amount", "paid_on", "method", "reference", "status", "voided_at", "created_at", "applied_to"],
  paymentApplied: ["invoice_id", "invoice_number", "amount"],
  version: ["doc_type", "doc_id", "version", "state", "event", "total", "approval", "created_at", "decided_at", "content"],
  money: ["contract_value", "received", "receipts"],
  moneyReceipt: ["number", "amount", "paid_on", "token"],
  photo: ["id", "storage_path", "caption"],
  delivery: ["id", "supplier", "expected_delivery_date", "status", "photos"],
  event: ["id", "kind", "summary", "created_at"],
  scheduleUpdate: ["id", "posted_at", "reason", "from_start", "from_end", "to_start", "to_end"],
  review: ["link_path"],
  progress: ["updates", "features", "milestone_presets", "before_after", "marketing_ok"],
  progressUpdate: ["id", "date", "text", "milestone", "feature", "photos", "liked", "comments"],
  progressComment: ["author", "name", "body", "created_at"],
  progressFeature: ["id", "label", "category", "milestones"],
  beforeAfter: ["feature", "before", "after"],
  care: ["items", "warranties", "opted_out"],
  careItem: ["label", "description", "as_needed", "next_month", "feature"],
  warranty: ["feature", "ends_on"],
} as const;

/** Fields that must never reach a client. The test checks none of these
 * is whitelisted and none survives sanitizing. */
export const INTERNAL_FIELDS = [
  "user_id", "share_token", "cost", "unit_cost", "line_cost", "cost_type", "cost_bucket", "costs",
  "profit", "margin", "margin_pct", "target_margin_pct", "markup", "overhead", "overhead_rate", "burden",
  "break_even", "labor_cost", "labor_hours", "labor_rate", "labor_mode", "man_hours", "labor_lump_sum",
  "cost_plan", "materials_items", "material_sheet_id", "supplier_cost", "price_book_item_id", "feature_id",
  "category_id", "note", "internal_notes", "site_conditions", "quick_quote_build_type", "viewed_at", "voided_by",
  "void_reason", "created_by", "estimated_cost", "cogs",
  // 0162 — a Cost plan line's description (crew / order sheet only)
  "internal_description",
  // 0163 — sales tax the contractor pays on Cost plan lines (internal cost)
  "taxable", "tax_rate", "tax_rate_source", "tax_off", "tax_notice", "default_tax_rate",
  // Feature 5 — planned vs actual, closeouts, estimating insights
  "job_slope", "job_access", "job_soil", "job_demo", "smart_inputs", "variance", "planned", "actual",
  "closeout", "closeouts", "what_happened", "excluded", "snapshot", "report", "units", "labor_ratio",
  "recommendation", "adjustments", "tunables", "labor_default",
  // Client Selections — internal cost, Cost plan link, Catalog / supplier
  "cost_delta", "link_item_id", "link_set", "catalog_product_id", "vendor", "approved_price",
  // Quote activity tracking — never client-facing
  "view_count", "first_viewed_at", "last_viewed_at", "last_view_device", "last_activity_at", "selections_changed_at",
  "sessions", "active_seconds", "session_key",
  // Rain delay + client heads-up — internal schedule detail
  "crew_id", "crew_name", "changes", "cascaded", "delay_id", "heads_up_status", "message", "channel", "client_visible", "mode",
  // Review requests — tracking is internal (the client only gets the link)
  "click_count", "first_clicked_at", "last_clicked_at", "asked_at", "asked_channel", "reminded_at", "no_review_requests", "google_url",
  // Progress updates — internal-only fields
  "original_path", "author_employee_id", "progress_update_id", "ba_role", "portfolio",
] as const;

type Row = Record<string, unknown>;

function pick<T>(obj: unknown, fields: readonly string[], nested: Record<string, (v: unknown) => unknown> = {}): T {
  if (!obj || typeof obj !== "object") return obj as T;
  const out: Row = {};
  for (const f of fields) {
    if (!(f in (obj as Row))) continue;
    const v = (obj as Row)[f];
    out[f] = nested[f] && v != null ? nested[f](v) : v;
  }
  return out as T;
}

const list = (fn: (v: unknown) => unknown) => (v: unknown) => (Array.isArray(v) ? v.map(fn) : []);

export const clientApproval = (a: unknown) => pick<PortalApproval>(a, CLIENT_FIELDS.approval);
const image = (v: unknown) => pick(v, CLIENT_FIELDS.image);

export const clientSelectionGroup = (g: unknown) =>
  pick(g, CLIENT_FIELDS.selectionGroup, {
    options: list((o) => pick(o, CLIENT_FIELDS.selectionOption)),
    history: list((h) => pick(h, CLIENT_FIELDS.selectionHistory)),
  });

export const clientQuote = (q: unknown) =>
  pick<PortalQuote>(q, CLIENT_FIELDS.quote, {
    approval: clientApproval,
    sections: list((s) =>
      pick(s, CLIENT_FIELDS.quoteSection, {
        items: list((i) => pick(i, CLIENT_FIELDS.quoteItem, { images: list(image) })),
        selections: list(clientSelectionGroup),
      }),
    ),
  });

export const clientChangeOrder = (c: unknown) =>
  pick<PortalChangeOrder>(c, CLIENT_FIELDS.changeOrder, {
    approval: clientApproval,
    sections: list((s) =>
      pick(s, CLIENT_FIELDS.changeOrderSection, { items: list((i) => pick(i, CLIENT_FIELDS.changeOrderItem, { images: list(image) })) }),
    ),
  });

export const clientInvoice = (i: unknown) =>
  pick<PortalInvoice>(i, CLIENT_FIELDS.invoice, { items: list((x) => pick(x, CLIENT_FIELDS.invoiceItem)) });

export const clientPayment = (p: unknown) =>
  pick<PortalPayment>(p, CLIENT_FIELDS.payment, { applied_to: list((a) => pick(a, CLIENT_FIELDS.paymentApplied)) });

export function clientVersion(v: unknown): PortalVersion {
  const doc = (v as Row)?.doc_type;
  const content = doc === "quote" ? clientQuote : doc === "change_order" ? clientChangeOrder : clientInvoice;
  return pick<PortalVersion>(v, CLIENT_FIELDS.version, { approval: clientApproval, content });
}

/** The whole Client Hub payload, whitelisted. */
export function clientSafeProjectDetail(d: PortalProjectDetail): PortalProjectDetail {
  const r = d as unknown as Row;
  return {
    project: pick(r.project, CLIENT_FIELDS.project),
    business: pick(r.business ?? {}, CLIENT_FIELDS.business),
    client: r.client ? pick(r.client, CLIENT_FIELDS.client) : null,
    quotes: list(clientQuote)(r.quotes) as PortalQuote[],
    change_orders: list(clientChangeOrder)(r.change_orders) as PortalChangeOrder[],
    invoices: list(clientInvoice)(r.invoices) as PortalInvoice[],
    payments: list(clientPayment)(r.payments) as PortalPayment[],
    versions: list(clientVersion)(r.versions) as PortalVersion[],
    money: r.money ? pick(r.money, CLIENT_FIELDS.money, { receipts: list((x) => pick(x, CLIENT_FIELDS.moneyReceipt)) }) : null,
    photos: list((x) => pick(x, CLIENT_FIELDS.photo))(r.photos),
    deliveries: list((x) => pick(x, CLIENT_FIELDS.delivery, { photos: list((y) => pick(y, CLIENT_FIELDS.photo)) }))(r.deliveries),
    events: list((x) => pick(x, CLIENT_FIELDS.event))(r.events),
    schedule_updates: list((x) => pick(x, CLIENT_FIELDS.scheduleUpdate))(r.schedule_updates),
    review: r.review ? pick(r.review, CLIENT_FIELDS.review) : null,
    progress: r.progress
      ? pick(r.progress, CLIENT_FIELDS.progress, {
          updates: list((u) =>
            pick(u, CLIENT_FIELDS.progressUpdate, {
              photos: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
              comments: list((c) => pick(c, CLIENT_FIELDS.progressComment)),
            }),
          ),
          features: list((f) =>
            pick(f, CLIENT_FIELDS.progressFeature, {
              milestones: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : null),
            }),
          ),
          milestone_presets: (v) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, Array.isArray(x) ? x.filter((y) => typeof y === "string") : []]))
              : {},
          before_after: list((b) => pick(b, CLIENT_FIELDS.beforeAfter)),
        })
      : null,
    care: r.care
      ? pick(r.care, CLIENT_FIELDS.care, {
          items: list((i) => pick(i, CLIENT_FIELDS.careItem)),
          warranties: list((w) => pick(w, CLIENT_FIELDS.warranty)),
        })
      : null,
  } as PortalProjectDetail;
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

// ---------------------------------------------------------------------------
// Public share links — same whitelist, same output shapes as before.
// ---------------------------------------------------------------------------

const named = (v: unknown) => (v ? pick<{ name: string }>(v, ["name"]) : null);

/** The contractor's business on a share page (0150) — whitelisted fields only. */
const sharedBusiness = (b: unknown) => (b ? pick(b, CLIENT_FIELDS.business) : null);

export function clientSharedQuote<T>(data: T): T {
  if (!data) return data;
  const r = data as unknown as Row;
  const q = clientQuote({ ...(r.quote as Row), sections: r.sections });
  const { sections, ...quote } = q as PortalQuote & Row;
  return { quote, project: named(r.project), client: named(r.client), business: sharedBusiness(r.business), sections } as unknown as T;
}

export function clientSharedChangeOrder<T>(data: T): T {
  if (!data) return data;
  const r = data as unknown as Row;
  const c = clientChangeOrder({ ...(r.change_order as Row), sections: r.sections });
  const { sections, ...change_order } = c as PortalChangeOrder & Row;
  return { change_order, project: named(r.project), client: named(r.client), business: sharedBusiness(r.business), sections } as unknown as T;
}

export function clientSharedInvoice<T>(data: T): T {
  if (!data) return data;
  const r = data as unknown as Row;
  const i = clientInvoice({ ...(r.invoice as Row), items: r.items });
  const { items, ...invoice } = i as PortalInvoice & Row;
  return { invoice, project: named(r.project), client: named(r.client), business: sharedBusiness(r.business), items } as unknown as T;
}

export function clientSharedReceipt<T>(data: T): T {
  if (!data) return data;
  const r = data as unknown as Row;
  return {
    receipt: pick(r.receipt, ["number", "amount", "paid_on", "method", "reference", "status", "voided_at"]),
    business: r.business ? pick(r.business, CLIENT_FIELDS.business) : null,
    project: r.project ? pick(r.project, ["name", "address"]) : null,
    client: named(r.client),
    applied_to: list((a) => pick(a, CLIENT_FIELDS.paymentApplied))(r.applied_to),
    contract_value: r.contract_value ?? null,
    received_through: r.received_through ?? null,
    remaining_balance: r.remaining_balance ?? null,
  } as unknown as T;
}
