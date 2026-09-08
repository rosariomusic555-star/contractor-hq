import type { InvoiceStatus, ProjectStatus, QuoteStatus } from "./api";

/**
 * Single source of truth for status presentation across the app — badge class,
 * a phone-card left-border colour, and a tone key. Replaces the per-view
 * `STATUS_META` / `statusStyles` maps that had drifted out of sync.
 *
 * Some keys ("declined", "expired", "scheduled", "in_progress") are
 * visual-only states the schema does not persist — they come from demoData and
 * are surfaced here so the pills render consistently.
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

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteVisualStatus = QuoteStatus | "declined" | "expired";

const QUOTE_META: Record<QuoteVisualStatus, StatusMeta> = {
  draft: meta("Draft", "grey"),
  sent: meta("Sent", "blue"),
  approved: meta("Approved", "green"),
  declined: meta("Declined", "red"),
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
  sent: meta("Sent", "amber"),
  paid: meta("Paid", "green"),
  overdue: meta("Overdue", "red"),
};

export function invoiceStatusMeta(status: string): StatusMeta {
  return INVOICE_META[status as InvoiceStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  draft: meta("Draft", "grey"),
  quote_sent: meta("Quote sent", "blue"),
  approved: meta("Approved", "green"),
  invoiced: meta("Invoiced", "amber"),
  paid: meta("Paid", "greenSolid"),
};

export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[];

/** Tolerates legacy / unexpected status strings without throwing. */
export function projectStatusMeta(status: string): StatusMeta {
  return PROJECT_STATUS_META[status as ProjectStatus] ?? meta(titleCase(status), "grey");
}

// ---------------------------------------------------------------------------
// Visual-only states (crew scheduling / job pipeline — demoData only)
// ---------------------------------------------------------------------------

export const VISUAL_STATUS_META = {
  scheduled: meta("Scheduled", "blue"),
  in_progress: meta("In progress", "green"),
  complete: meta("Complete", "green"),
  quoting: meta("Quoting", "grey"),
  site_visit: meta("Site visit", "grey"),
} as const;

export type VisualOnlyStatus = keyof typeof VISUAL_STATUS_META;

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown";
}
