import type {
  AppointmentStatus,
  ChangeOrderStatus,
  ClientStatus,
  InvoiceStatus,
  MaterialOrderStatus,
  OpportunityStage,
  ProjectStatus,
  QuoteStatus,
} from "./api";

/**
 * Single source of truth for status presentation across the app — badge class,
 * a phone-card left-border colour, and a tone key. Replaces the per-view
 * `STATUS_META` / `statusStyles` maps that had drifted out of sync.
 */
export type Tone = "green" | "greenSolid" | "amber" | "red" | "blue" | "grey";

export interface StatusMeta {
  label: string;
  /** Full class string for the pill — drop straight onto a `<span>`. */
  badge: string;
  /** CSS colour for a 3px left border on phone list cards. */
  border: string;
  tone: Tone;
}

const TONE: Record<Tone, Pick<StatusMeta, "badge" | "border">> = {
  green: { badge: "badge-status badge-paid", border: "hsl(var(--success))" },
  greenSolid: { badge: "badge-status badge-paid-solid", border: "hsl(var(--primary))" },
  amber: { badge: "badge-status badge-pending", border: "hsl(var(--warning-strong))" },
  red: { badge: "badge-status badge-overdue", border: "hsl(var(--destructive))" },
  blue: { badge: "badge-status badge-scheduled", border: "hsl(var(--info))" },
  grey: { badge: "badge-status badge-draft", border: "hsl(var(--border))" },
};

const meta = (label: string, tone: Tone): StatusMeta => ({ label, tone, ...TONE[tone] });

/** Solid tone classes for the Bookings calendar's status dots and
 * the legend swatches — same tone tokens as TONE above (badge/border),
 * just a solid fill instead of a tinted pill. */
export const TONE_SOLID_CLASS: Record<Tone, string> = {
  green: "bg-success text-success-foreground",
  greenSolid: "bg-primary text-primary-foreground",
  amber: "bg-warning-strong text-warning-foreground",
  red: "bg-destructive text-destructive-foreground",
  blue: "bg-info text-info-foreground",
  grey: "bg-muted-foreground text-background",
};

/** Light wash background — a mini month day cell tints with this when
 * every job covering that day shares one status, so a job's date range
 * reads as a continuous colored block. Mixed-status days fall back to a
 * neutral tint instead of picking one job's color arbitrarily. */
export const TONE_TINT_CLASS: Record<Tone, string> = {
  green: "bg-success/15",
  greenSolid: "bg-primary/15",
  amber: "bg-warning-strong/15",
  red: "bg-destructive/15",
  blue: "bg-info/15",
  grey: "bg-muted-foreground/15",
};

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteVisualStatus = QuoteStatus | "declined" | "expired";

const QUOTE_META: Record<QuoteVisualStatus, StatusMeta> = {
  draft: meta("Draft", "grey"),
  // "Shared" not "Sent" — generating the client link doesn't notify anyone.
  sent: meta("Shared", "blue"),
  approved: meta("Approved", "green"),
  declined: meta("Declined", "red"),
  // A sibling option that lost once a different quote on the same project
  // was signed (migration 0073/0075) — never chosen by the client, not
  // rejected either, just never in the running once its sibling won.
  not_selected: meta("Not selected", "grey"),
  expired: meta("Expired", "red"),
};

export function quoteStatusMeta(status: string): StatusMeta {
  return QUOTE_META[status as QuoteVisualStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const INVOICE_META: Record<InvoiceStatus, StatusMeta> = {
  draft: meta("Draft", "grey"),
  sent: meta("Shared", "amber"),
  paid: meta("Paid", "green"),
  overdue: meta("Overdue", "red"),
};

/** Pass amount_paid (0111) and an issued invoice with some payment applied
 * reads "Partially paid" (red while overdue). */
export function invoiceStatusMeta(status: string, amountPaid?: number | null): StatusMeta {
  if ((status === "sent" || status === "overdue") && Number(amountPaid ?? 0) > 0.004) {
    return meta("Partially paid", status === "overdue" ? "red" : "amber");
  }
  return INVOICE_META[status as InvoiceStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** Pure job-lifecycle now (migration 0073) — billing state is a separate
 * concept, see PROJECT_BILLING_META below, never mixed into this pill. */
export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  estimating: meta("Estimating", "grey"),
  scheduled: meta("Scheduled", "blue"),
  in_progress: meta("In progress", "amber"),
  complete: meta("Complete", "greenSolid"),
  lost: meta("Lost", "red"),
};

export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[];

/** Solid fill + contrasting text for a project status — the Bookings
 * legend's swatch color. The /bookings day circles, the Dashboard Bookings
 * card's day dots and its mobile heat swatch all use this too, so every
 * calendar surface matches the legend. */
export function projectStatusSolidClass(status: string): string {
  return TONE_SOLID_CLASS[projectStatusMeta(status).tone];
}

/** When jobs with different statuses share a calendar day (or month), the
 * one color shown — In progress beats Scheduled beats Complete. The day's
 * tooltip lists every job. */
const BOOKING_STATUS_PRIORITY: ProjectStatus[] = ["in_progress", "scheduled", "complete"];

export function bookingDisplayStatus(jobs: { status: string }[]): ProjectStatus | null {
  if (jobs.length === 0) return null;
  const present = new Set(jobs.map((j) => j.status));
  return BOOKING_STATUS_PRIORITY.find((s) => present.has(s)) ?? (jobs[0].status as ProjectStatus);
}

/** Tolerates legacy / unexpected status strings without throwing. */
export function projectStatusMeta(status: string): StatusMeta {
  return PROJECT_STATUS_META[status as ProjectStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Project billing badge — derived from invoices (src/lib/financials.ts's
// projectBillingBadge()), never stored. Shown ALONGSIDE the status pill
// above, never instead of it — status says where the job is, this says
// where the money is. Null (no badge) when there's nothing to bill yet.
// ---------------------------------------------------------------------------

export type ProjectBillingStatus = "deposit_due" | "invoiced" | "partially_paid" | "paid";

export const PROJECT_BILLING_META: Record<ProjectBillingStatus, StatusMeta> = {
  deposit_due: meta("Deposit due", "amber"),
  invoiced: meta("Invoiced", "blue"),
  partially_paid: meta("Partially paid", "amber"),
  paid: meta("Paid", "greenSolid"),
};

export function projectBillingStatusMeta(status: ProjectBillingStatus): StatusMeta {
  return PROJECT_BILLING_META[status];
}

// ---------------------------------------------------------------------------
// Change orders
// ---------------------------------------------------------------------------

const CHANGE_ORDER_META: Record<ChangeOrderStatus, StatusMeta> = {
  draft: meta("Draft", "grey"),
  sent: meta("Sent", "blue"),
  approved: meta("Approved", "green"),
  declined: meta("Declined", "red"),
};

export function changeOrderStatusMeta(status: string): StatusMeta {
  return CHANGE_ORDER_META[status as ChangeOrderStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Material orders (0056)
// ---------------------------------------------------------------------------

const MATERIAL_ORDER_META: Record<MaterialOrderStatus, StatusMeta> = {
  ordered: meta("Ordered", "blue"),
  delivered: meta("Delivered", "green"),
  delayed: meta("Delayed", "red"),
};

export function materialOrderStatusMeta(status: string): StatusMeta {
  return MATERIAL_ORDER_META[status as MaterialOrderStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Clients (CRM, 0048) — a real, persisted status, distinct from
// ClientsView.tsx's own computed "kind" (active/repeat/lead/client),
// which derives from real project/invoice history rather than this
// manually-set field.
// ---------------------------------------------------------------------------

export const CLIENT_STATUS_META: Record<ClientStatus, StatusMeta> = {
  lead: meta("Lead", "grey"),
  active: meta("Active", "green"),
  past: meta("Past", "blue"),
  inactive: meta("Inactive", "red"),
};

export const CLIENT_STATUSES = Object.keys(CLIENT_STATUS_META) as ClientStatus[];

export function clientStatusMeta(status: string): StatusMeta {
  return CLIENT_STATUS_META[status as ClientStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Opportunities / sales pipeline (CRM Phase 2, 0049). Order here is the
// Kanban board's column order (Object.keys preserves insertion order),
// same convention as PROJECT_STATUSES.
// ---------------------------------------------------------------------------

export const OPPORTUNITY_STAGE_META: Record<OpportunityStage, StatusMeta> = {
  new_lead: meta("New Lead", "grey"),
  contacted: meta("Contacted", "blue"),
  site_visit_scheduled: meta("Site Visit Scheduled", "blue"),
  site_visit_done: meta("Site Visit Done", "blue"),
  proposal_sent: meta("Proposal Sent", "amber"),
  revisions: meta("Revisions", "amber"),
  won: meta("Won", "greenSolid"),
  lost: meta("Lost", "red"),
};

export const OPPORTUNITY_STAGES = Object.keys(OPPORTUNITY_STAGE_META) as OpportunityStage[];

/** The two closing stages — rendered as visually distinct end columns on
 * the Kanban board (PipelineView.tsx), never mixed in with the active
 * stages. */
export const CLOSING_OPPORTUNITY_STAGES: OpportunityStage[] = ["won", "lost"];

export function opportunityStageMeta(stage: string): StatusMeta {
  return OPPORTUNITY_STAGE_META[stage as OpportunityStage] ?? meta(titleCase(stage), "grey");
}

// ---------------------------------------------------------------------------
// Appointments & site visits (CRM Phase 4, 0051)
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUS_META: Record<AppointmentStatus, StatusMeta> = {
  scheduled: meta("Scheduled", "blue"),
  completed: meta("Completed", "green"),
  cancelled: meta("Cancelled", "grey"),
  no_show: meta("No-Show", "red"),
};

export function appointmentStatusMeta(status: string): StatusMeta {
  return APPOINTMENT_STATUS_META[status as AppointmentStatus] ?? meta(titleCase(status), "grey");
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown";
}
