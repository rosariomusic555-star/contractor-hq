/* =============================================================================
 * PRESENTATION-ONLY DEMO DATA
 *
 * Everything in this module is fake. It exists so the redesigned screens read as
 * "complete and alive" for features the schema does not yet have (crew
 * scheduling, job-stage pipeline, per-job progress, work-type splits, quote
 * markup/tax lines, org quote defaults, automations, aging history).
 *
 * RULES:
 *   - Never imported by `src/lib/api.ts`.
 *   - Never passed to `supabase.*` or any create/update/delete call.
 *   - Real entities (projects, quotes, invoices, clients) always come from live
 *     data; this only decorates them.
 *   - Helpers are pure and deterministic (seeded off real row ids) so values are
 *     stable across renders and look plausible.
 *
 * Delete a section here as the corresponding real feature lands.
 * ========================================================================== */

import type { VisualOnlyStatus } from "./statusMeta";

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededPick<T>(arr: readonly T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

function seededInt(seed: string, min: number, max: number): number {
  return min + (hash(seed) % (max - min + 1));
}

// ---------------------------------------------------------------------------
// Org-level fixtures
// ---------------------------------------------------------------------------

export const DEMO_CREWS = [
  { id: "crew-a", name: "Crew A", size: 3, lead: "Marco R." },
  { id: "crew-b", name: "Crew B", size: 2, lead: "Devon P." },
  { id: "crew-c", name: "Crew C", size: 3, lead: "Sam W." },
] as const;

export const DEMO_REVENUE_GOAL = 95_000;
export const DEMO_WEEKS_BOOKED = 5.5;
export const DEMO_HOURS_PER_WEEK = 38;
export const DEMO_AVG_DAYS_TO_PAY = 19;

export const DEMO_TODAY_SCHEDULE: {
  time: string;
  title: string;
  subtitle: string;
  status: VisualOnlyStatus;
  crew: string;
}[] = [
  { time: "7:00a", title: "Kellerman patio", subtitle: "480 sf paver · 214 Ridgeway Dr", status: "in_progress", crew: "Crew A · 3" },
  { time: "9:30a", title: "Alvarez retaining wall", subtitle: "Block course 2 · 88 Linden Ave", status: "blocked", crew: "Crew B · 2" },
  { time: "2:00p", title: "Whitmore walkway", subtitle: "Site visit + measure · 7 Coldbrook Rd", status: "site_visit", crew: "You" },
];

export const DEMO_NEEDS_YOU: {
  tone: "red" | "amber" | "green" | "grey";
  title: string;
  subtitle: string;
  action: string;
}[] = [
  { tone: "red", title: "Invoice 41 days late", subtitle: "Delgado driveway · $9,850", action: "Remind" },
  { tone: "grey", title: "Quote sent 6 days ago", subtitle: "Brennan fire pit + seat wall · $22,300", action: "Follow up" },
  { tone: "green", title: "Quote approved — needs deposit", subtitle: "Okonkwo patio · 30% of $34,600", action: "Bill" },
  { tone: "amber", title: "Base delivery unconfirmed", subtitle: "Alvarez retaining wall · Crew B idle 9:30a", action: "Call" },
];

export const DEMO_WORK_TYPE_SPLIT = [
  { label: "Paver patios & walks", amount: 248_600, pct: 43, color: "hsl(var(--primary))" },
  { label: "Retaining walls", amount: 132_300, pct: 23, color: "hsl(var(--sidebar-background))" },
  { label: "Driveways", amount: 109_800, pct: 19, color: "hsl(var(--info))" },
  { label: "Steps, seat walls, fire pits", amount: 63_300, pct: 11, color: "hsl(var(--warning-strong))" },
  { label: "Repairs & maintenance", amount: 21_200, pct: 4, color: "hsl(var(--border))" },
] as const;

export const DEMO_QUOTE_DEFAULTS = {
  depositPct: 30,
  materialMarkupPct: 22,
  laborRate: 68,
  quoteValidityDays: 14,
  salesTaxPct: 6.25,
  wasteFactorPct: 8,
  terms:
    "Prices hold for 14 days. Excavation assumes no ledge or buried utilities; unforeseen conditions billed at $68/hr plus materials. 5-year workmanship warranty on base and installation; manufacturer warranty on all paver and wall product.",
} as const;

export const DEMO_AUTOMATIONS = [
  { id: "quote-followup", label: "Quote follow-up", description: "Nudge the client 5 days after sending if no reply", enabled: true },
  { id: "overdue-reminders", label: "Overdue invoice reminders", description: "Every 7 days past due, up to 4 times", enabled: true },
  { id: "deposit-on-approval", label: "Deposit request on approval", description: "Draft the deposit invoice the moment a quote is signed", enabled: false },
] as const;

// ---------------------------------------------------------------------------
// Per-project decoration (seeded off project.id + real status)
// ---------------------------------------------------------------------------

interface ProjectLike {
  id: string;
  status: string;
}

const STAGE_BY_STATUS: Record<string, VisualOnlyStatus> = {
  draft: "quoting",
  quote_sent: "quoting",
  approved: "scheduled",
  invoiced: "in_progress",
  paid: "complete",
};

const NEXT_ACTION = [
  "Follow up",
  "Order materials",
  "Confirm crew",
  "Site visit",
  "Progress draw",
  "Punch list",
] as const;

export interface DemoJobMeta {
  stage: VisualOnlyStatus;
  crew: string;
  progressPct: number;
  dayOfTotal: { day: number; total: number } | null;
  nextAction: string;
  scheduledLabel: string;
}

export function demoJobMeta(project: ProjectLike): DemoJobMeta {
  const stage: VisualOnlyStatus =
    project.status === "approved" && hash(project.id) % 2 === 0
      ? "in_progress"
      : STAGE_BY_STATUS[project.status] ?? "quoting";

  const crew = seededPick(DEMO_CREWS, project.id).name;
  const total = seededInt(project.id + "t", 4, 8);
  const day = Math.min(total, seededInt(project.id + "d", 1, total));
  const active = stage === "in_progress";
  const complete = stage === "complete";

  return {
    stage,
    crew,
    progressPct: complete ? 100 : active ? Math.round((day / total) * 100) : stage === "scheduled" ? 0 : seededInt(project.id + "p", 5, 40),
    dayOfTotal: active ? { day, total } : null,
    nextAction: seededPick(NEXT_ACTION, project.id + "n"),
    scheduledLabel: seededPick(
      ["Today 7:00a", "Tomorrow", "Mon", "Sept 22", "Oct 6", "Next week"],
      project.id + "s",
    ),
  };
}

export interface DemoCostSplit {
  materials: number;
  labor: number;
  equipment: number;
  disposal: number;
}

/** Materials figure is real (from the materials sheet); the rest is fake. */
export function demoJobCostSplit(project: ProjectLike, materialsReal: number): DemoCostSplit {
  const base = materialsReal > 0 ? materialsReal : seededInt(project.id + "m", 2200, 9000);
  return {
    materials: materialsReal,
    labor: Math.round(base * (0.7 + (hash(project.id + "l") % 30) / 100)),
    equipment: seededInt(project.id + "e", 180, 900),
    disposal: seededInt(project.id + "z", 120, 600),
  };
}

export function demoJobActivity(project: ProjectLike): { when: string; text: string }[] {
  const crew = seededPick(DEMO_CREWS, project.id).name;
  return [
    { when: "Today 7:04a", text: `${crew} clocked in` },
    { when: "Yesterday", text: "Base compacted, inspected at 6 in" },
    { when: "3 days ago", text: "Progress draw 1 paid" },
    { when: "Last week", text: "Materials delivered to site" },
    { when: "2 weeks ago", text: "Quote signed by client" },
  ];
}

// ---------------------------------------------------------------------------
// Quote financials — layered on the REAL quote total
// ---------------------------------------------------------------------------

export interface DemoQuoteFinancials {
  markupPct: number;
  markupAmount: number;
  taxPct: number;
  taxAmount: number;
  estCost: number;
  marginPct: number;
  validUntilLabel: string;
}

export function demoQuoteFinancials(realQuoteTotal: number): DemoQuoteFinancials {
  const markupPct = DEMO_QUOTE_DEFAULTS.materialMarkupPct;
  const taxPct = DEMO_QUOTE_DEFAULTS.salesTaxPct;
  const estCost = Math.round(realQuoteTotal * 0.6);
  const materialsPortion = Math.round(realQuoteTotal * 0.35);
  return {
    markupPct,
    markupAmount: Math.round((materialsPortion * markupPct) / 100),
    taxPct,
    taxAmount: Math.round((materialsPortion * taxPct) / 100),
    estCost,
    marginPct: realQuoteTotal > 0 ? Math.round(((realQuoteTotal - estCost) / realQuoteTotal) * 100) : 0,
    validUntilLabel: `${DEMO_QUOTE_DEFAULTS.quoteValidityDays} days`,
  };
}

// ---------------------------------------------------------------------------
// Invoice detail — breakdown that sums to the REAL amount
// ---------------------------------------------------------------------------

interface InvoiceLike {
  id: string;
  amount: number;
}

const LINE_LABELS = [
  "Excavation, base and compaction",
  "Paver field install",
  "Soldier border + step",
  "Polymeric sand and seal",
  "Site prep & disposal",
] as const;

export function demoInvoiceLineItems(invoice: InvoiceLike): { label: string; amount: number }[] {
  const amount = Number(invoice.amount) || 0;
  const count = 3 + (hash(invoice.id) % 2);
  const weights = Array.from({ length: count }, (_, i) => 1 + (hash(invoice.id + i) % 5));
  const sum = weights.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return weights.map((w, i) => {
    const isLast = i === count - 1;
    const line = isLast ? amount - allocated : Math.round((amount * w) / sum);
    allocated += line;
    return { label: LINE_LABELS[i % LINE_LABELS.length], amount: line };
  });
}

export function demoInvoiceHistory(invoice: InvoiceLike): { when: string; text: string }[] {
  return [
    { when: "This week", text: "Reminder emailed — opened, no reply" },
    { when: "2 weeks ago", text: "Invoice sent" },
    { when: "1 month ago", text: `Progress draw paid — ${Math.round((Number(invoice.amount) || 0) * 0.4).toLocaleString()}` },
    { when: "6 weeks ago", text: "Deposit paid" },
  ];
}
