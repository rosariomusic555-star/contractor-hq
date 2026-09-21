/* =============================================================================
 * Financials — the ONE shared module for every derived money figure that
 * spans more than a single record: date ranges, invoiced/collected/
 * outstanding, aging, per-project cost/profit/margin, "closed" jobs, and
 * the revenue-by-category / revenue-by-client breakdowns. Every screen that
 * shows one of these figures — Dashboard, the Revenue page and its detail
 * pages, Bookings, Ongoing jobs, project pages, the Change Order builder —
 * calls into these same pure functions with the same input arrays, so a
 * card and its detail page (and every other screen) can never disagree.
 *
 * Canonical definitions (see the CRM/financials audit for the full
 * reasoning):
 *   - A quote's total (quoteTotal() in api.ts) already only counts required
 *     items plus whatever optional items the client has actually selected
 *     — never speculative optional work nobody picked.
 *   - Contract value (projectContractValue() in api.ts) = that quote total
 *     + APPROVED change orders only. Pending/declined change orders never
 *     count toward it.
 *   - "Invoiced" never counts a draft invoice — it hasn't been sent to
 *     anyone, so it isn't a real obligation yet.
 *   - "Collected" = paid invoices, dated by when they were actually paid
 *     (paid_at), not when they were billed.
 *   - "Outstanding" = sent + overdue invoices — always a live snapshot,
 *     not date-range-scoped (same as real-world AR aging).
 *   - Unqualified "revenue" (revenue by category, revenue by client) means
 *     COLLECTED — cash actually received, not merely billed. Anywhere a
 *     screen needs the invoiced (billed) basis instead, it says so
 *     explicitly ("Invoiced").
 *   - A job is "closed" once it's been fully collected (collected ≥
 *     contract value) — derived, live, never a manual status field to
 *     remember to set.
 *   - Cost (for profit/margin) = actual logged expenses if any exist, else
 *     the Materials Sheet's predicted cost, else unknown — unknown-cost
 *     jobs are excluded from margin averages, never treated as zero-cost.
 *   - Draft, void, and declined documents never count toward any total.
 * ========================================================================== */

import type {
  Category,
  ChangeOrder,
  Client,
  Invoice,
  MaterialsItem,
  MaterialsSection,
  MaterialsSheet,
  MaterialsUsageLog,
  Project,
  Quote,
} from "./api";
import { materialsCogs, pickHeadlineQuote, projectContractValue, quoteItemIncluded, quoteLineTotal } from "./api";
import type { ProjectBillingStatus } from "./statusMeta";
import { sheetCostSummary, type DeliveryLineWithOrderStatus, type SheetCostSummary } from "./materialTracking";

/** Actual material cost for a project's tracked sheet(s) (0080) — "flows
 * into project margin via the shared financials module" per spec. A thin
 * pass-through to materialTracking.ts's sheetCostSummary (which owns the
 * unit-conversion/rollup math) rather than a duplicate implementation;
 * this module is just where the rest of the app already looks for money
 * figures. See ProjectDetailView for how this overrides the Profit
 * Summary's cost figure once a project is Complete and reconciled —
 * deliberately NOT folded into buildProjectFinancials' own cost/profit
 * fields below, so a contractor who's also hand-logging material Expenses
 * during the same transition period never gets silently double-counted. */
export function materialActualCost(
  trackedLines: MaterialsItem[],
  deliveries: DeliveryLineWithOrderStatus[],
  usageLogs: MaterialsUsageLog[],
): SheetCostSummary {
  return sheetCostSummary(trackedLines, deliveries, usageLogs);
}

// ---------------------------------------------------------------------------
// Date ranges — the one selector every Revenue-page card/detail page shares.
// ---------------------------------------------------------------------------

export type RangeKey = "this_month" | "last_3" | "last_12" | "ytd" | "custom";

export interface DateRange {
  key: RangeKey;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  label: string;
}

export const RANGE_PRESETS: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "this_month", label: "This month" },
  { key: "last_3", label: "Last 3 months" },
  { key: "last_12", label: "Last 12 months" },
  { key: "ytd", label: "Year to date" },
];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const dayAfter = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/**
 * Resolves a range key (+ custom bounds, "yyyy-mm-dd" strings) to concrete
 * start/end Dates. `end` is always exclusive and always "tomorrow" (or the
 * day after a custom end date) so anything dated today is included
 * regardless of time-of-day. Passing a `now` inside a past/future month
 * (rather than today) resolves "this_month" to THAT month — the trick
 * DashboardView uses to get "last calendar month" without a separate preset.
 */
export function resolveRange(
  key: RangeKey,
  custom: { start: string; end: string } | undefined,
  now: Date = new Date(),
): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = dayAfter(today);
  switch (key) {
    case "this_month":
      return { key, start: startOfMonth(today), end, label: "This month" };
    case "last_3":
      return { key, start: new Date(today.getFullYear(), today.getMonth() - 2, 1), end, label: "Last 3 months" };
    case "last_12":
      return { key, start: new Date(today.getFullYear(), today.getMonth() - 11, 1), end, label: "Last 12 months" };
    case "ytd":
      return { key, start: new Date(today.getFullYear(), 0, 1), end, label: "Year to date" };
    case "custom": {
      const start = custom?.start ? new Date(`${custom.start}T00:00:00`) : startOfMonth(today);
      const rawEnd = custom?.end ? new Date(`${custom.end}T00:00:00`) : today;
      return { key, start, end: dayAfter(rawEnd), label: "Custom" };
    }
  }
}

/** Every record, regardless of date — for call sites that want an
 * all-time total but still want to go through the same shared
 * invoiced/collected functions rather than a second, hand-rolled filter. */
export const ALL_TIME_RANGE: DateRange = {
  key: "custom",
  start: new Date(0),
  end: new Date(8_640_000_000_000_000),
  label: "All time",
};

export function withinRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= range.start && d < range.end;
}

/** "Sep 1 – Sep 20, 2026" style label for a resolved range, for detail-page
 * subtitles. */
export function rangeDateLabel(range: DateRange): string {
  const endInclusive = new Date(range.end.getTime() - 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(range.start)} – ${fmt(endInclusive)}`;
}

// ---------------------------------------------------------------------------
// 1. Invoiced — never counts a draft invoice (see module doc comment).
// ---------------------------------------------------------------------------

const isRealInvoice = (i: Invoice) => i.status !== "draft";

export function invoicedInRange(invoices: Invoice[], range: DateRange): Invoice[] {
  return invoices.filter((i) => isRealInvoice(i) && withinRange(i.created_at, range));
}

export function invoicedTotal(invoices: Invoice[], range: DateRange): number {
  return invoicedInRange(invoices, range).reduce((s, i) => s + Number(i.amount), 0);
}

// ---------------------------------------------------------------------------
// 2. Collected
// ---------------------------------------------------------------------------

/** "Collected" = paid invoices, dated by when they were actually paid
 * (paid_at — always stamped alongside status=paid, see InvoiceWorkspace's
 * "Mark paid" action), not when they were billed. */
export function collectedInRange(invoices: Invoice[], range: DateRange): Invoice[] {
  return invoices.filter((i) => i.status === "paid" && withinRange(i.paid_at ?? i.created_at, range));
}

export function collectedTotal(invoices: Invoice[], range: DateRange): number {
  return collectedInRange(invoices, range).reduce((s, i) => s + Number(i.amount), 0);
}

/** What fraction of what was billed in range has actually been collected.
 * null when nothing was invoiced in range (nothing to divide by). */
export function collectionRate(invoices: Invoice[], range: DateRange): number | null {
  const billed = invoicedTotal(invoices, range);
  if (billed <= 0) return null;
  return (collectedTotal(invoices, range) / billed) * 100;
}

// ---------------------------------------------------------------------------
// 3. Outstanding / aging — always a live snapshot, never date-range-scoped.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const parseDueDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/**
 * Days an invoice is past its due date. Negative = not due yet, 0 = no due
 * date or not applicable (paid / draft). Real, derived from `due_date`.
 */
export function invoiceDaysLate(inv: Pick<Invoice, "due_date" | "status">, now: Date = new Date()): number {
  if (!inv.due_date || inv.status === "paid" || inv.status === "draft") return 0;
  return Math.floor((now.getTime() - parseDueDate(inv.due_date).getTime()) / DAY);
}

export interface AgingBucket {
  key: "current" | "d1_30" | "d31_60" | "d60";
  label: string;
  amount: number;
  count: number;
}

/** Buckets the outstanding (sent + overdue) invoices by how late they are. */
export function agingBuckets(invoices: Invoice[], now: Date = new Date()): AgingBucket[] {
  const buckets: Record<AgingBucket["key"], AgingBucket> = {
    current: { key: "current", label: "Current", amount: 0, count: 0 },
    d1_30: { key: "d1_30", label: "1–30 days", amount: 0, count: 0 },
    d31_60: { key: "d31_60", label: "31–60 days", amount: 0, count: 0 },
    d60: { key: "d60", label: "60+ days", amount: 0, count: 0 },
  };
  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    const late = invoiceDaysLate(inv, now);
    const b = late <= 0 ? buckets.current : late <= 30 ? buckets.d1_30 : late <= 60 ? buckets.d31_60 : buckets.d60;
    b.amount += Number(inv.amount);
    b.count += 1;
  }
  return [buckets.current, buckets.d1_30, buckets.d31_60, buckets.d60];
}

/** Everything billed and not yet paid, as of right now — the one figure
 * every "Outstanding" / "Unpaid" tile in the app shows. */
export function outstandingTotal(invoices: Invoice[]): number {
  return agingBuckets(invoices).reduce((s, b) => s + b.amount, 0);
}

/** Count of outstanding invoices more than `days` past due. */
export function overdueCount(invoices: Invoice[], days = 30, now: Date = new Date()): number {
  return invoices.filter(
    (i) => (i.status === "sent" || i.status === "overdue") && invoiceDaysLate(i, now) > days,
  ).length;
}

// ---------------------------------------------------------------------------
// 4. Cost / profit / margin — the one cascade every screen uses.
// ---------------------------------------------------------------------------

/** The one canonical "cost" for margin/profit purposes: actual logged
 * expenses if any have been logged, else the Materials Sheet's predicted
 * cost, else unknown (null). Unknown-cost jobs are excluded from margin
 * averages entirely — never silently treated as zero-cost. */
export function resolveCost(actualCost: number | null, predictedCost: number | null): number | null {
  return actualCost ?? predictedCost ?? null;
}

/** A job counts as closed once it's been fully paid off — derived, live,
 * from the same contract-value and collected-total figures every other
 * screen already shows. Never a manual field to remember to set. */
export function isProjectClosed(contractValue: number, collected: number): boolean {
  return contractValue > 0 && collected >= contractValue;
}

/** Projects the pipeline restructure (migration 0073) keeps out of every
 * revenue/financial total — an Estimating project isn't a real job yet
 * (it's still being sold), and a Lost one never became one. Their quotes
 * still count toward the CRM side's own pipeline value (PipelineView's
 * quoteValueByProjectId, unaffected by this — that's deliberately quote-
 * level, not project-status-gated), just never here. */
export function isExcludedFromFinancials(status: Project["status"]): boolean {
  return status === "estimating" || status === "lost";
}

/**
 * The billing badge — separate from and shown alongside the project's own
 * status pill (statusMeta.ts's PROJECT_STATUS_META says where the job is;
 * this says where the money is). Precedence, most specific first:
 *   1. nothing to bill yet (no contract value)      -> null
 *   2. collected >= contract                         -> "paid"
 *   3. something collected, less than the full amount -> "partially_paid"
 *   4. collected hasn't covered the deposit yet       -> "deposit_due"
 *   5. something's been invoiced beyond that           -> "invoiced"
 *   6. otherwise (nothing invoiced, no deposit set)    -> null
 * In practice (4) fires almost every time before anything's paid, since
 * quotes default to a real deposit percentage — "invoiced" mainly shows
 * for a quote with no deposit configured at all.
 */
export function projectBillingBadge(
  contractValue: number,
  invoiced: number,
  collected: number,
  depositRequired: number,
): ProjectBillingStatus | null {
  if (contractValue <= 0) return null;
  if (collected >= contractValue) return "paid";
  if (collected > 0) return "partially_paid";
  if (depositRequired > 0 && collected < depositRequired) return "deposit_due";
  if (invoiced > 0) return "invoiced";
  return null;
}

// ---------------------------------------------------------------------------
// Per-project financials — the shared building block behind Avg. margin,
// Avg. job, "closed", and Revenue by category/client's job counts.
// ---------------------------------------------------------------------------

export interface ProjectFinancials {
  project: Project;
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  /** projectContractValue() — the same "contract value" number shown on
   * the project page's own Money card, everywhere. */
  contractValue: number;
  /** All-time collected total for this one project (status=paid, any
   * date) — what isProjectClosed()/closedJobRows() below compare against
   * contractValue. */
  collectedTotal: number;
  /** Derived, live — see isProjectClosed(). */
  closed: boolean;
  hasMaterialsSheet: boolean;
  hasExpenses: boolean;
  /** null when there's no cost source at all — "cost unknown," per
   * resolveCost()'s own doc comment, not zero. */
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  category: { id: string; name: string } | null;
  /** The date this job "belongs to" for range filtering / display —
   * actual completion if known, else the scheduled end, else when the
   * project was created. */
  jobDate: string;
}

const UNCATEGORIZED = { id: "uncategorized", name: "Uncategorized" };

/** A job's category isn't a stored field — it's derived from whichever
 * category has the largest dollar share of its headline quote's included
 * line items, same "largest line item wins" spirit as jobSizeLabel(). */
function dominantCategory(quote: Quote | undefined, categories: Category[]): { id: string; name: string } | null {
  if (!quote) return null;
  const totals = new Map<string, number>();
  for (const section of quote.quote_sections) {
    for (const item of section.quote_items ?? []) {
      if (!quoteItemIncluded(section, item)) continue;
      const key = item.category_id ?? "uncategorized";
      totals.set(key, (totals.get(key) ?? 0) + quoteLineTotal(item));
    }
  }
  if (totals.size === 0) return null;
  const [bestId] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestId === "uncategorized") return UNCATEGORIZED;
  const name = categories.find((c) => c.id === bestId)?.name;
  return name ? { id: bestId, name } : UNCATEGORIZED;
}

export function jobDateOf(project: Project): string {
  return project.actual_end_date ?? project.scheduled_end_date ?? project.created_at;
}

/**
 * Estimating and Lost projects (migration 0073) never enter a revenue/
 * financial total (see isExcludedFromFinancials) — filtered out here,
 * upstream of every function that consumes this array (avg margin, avg
 * job, revenue by category/client), so no caller can forget the rule.
 */
export function buildProjectFinancials(
  projects: Project[],
  quotesByProject: Map<string, Quote[]>,
  changeOrdersByProject: Map<string, ChangeOrder[]>,
  invoicesByProject: Map<string, Invoice[]>,
  materialsSheets: MaterialsSheet[],
  materialsSections: MaterialsSection[],
  expensesByProject: Map<string, { amount: number }[]>,
  categories: Category[],
): ProjectFinancials[] {
  const eligibleProjects = projects.filter((p) => !isExcludedFromFinancials(p.status));
  const sheetsByProject = new Map<string, MaterialsSheet[]>();
  for (const sheet of materialsSheets) {
    const list = sheetsByProject.get(sheet.project_id);
    if (list) list.push(sheet);
    else sheetsByProject.set(sheet.project_id, [sheet]);
  }
  const sectionsByProject = new Map<string, MaterialsSection[]>();
  for (const section of materialsSections) {
    const list = sectionsByProject.get(section.project_id);
    if (list) list.push(section);
    else sectionsByProject.set(section.project_id, [section]);
  }

  return eligibleProjects.map((project) => {
    const quotes = quotesByProject.get(project.id) ?? [];
    const changeOrders = changeOrdersByProject.get(project.id) ?? [];
    const invoices = invoicesByProject.get(project.id) ?? [];
    const expenses = expensesByProject.get(project.id) ?? [];

    const contractValue = projectContractValue(quotes, changeOrders);
    const collected = collectedTotal(invoices, ALL_TIME_RANGE);
    const closed = isProjectClosed(contractValue, collected);

    const hasMaterialsSheet = (sheetsByProject.get(project.id) ?? []).length > 0;
    const predictedCost = hasMaterialsSheet ? materialsCogs(sectionsByProject.get(project.id) ?? []) : null;
    const hasExpenses = expenses.length > 0;
    const actualCost = hasExpenses ? expenses.reduce((s, e) => s + Number(e.amount), 0) : null;
    const cost = resolveCost(actualCost, predictedCost);

    const profit = cost != null ? contractValue - cost : null;
    const marginPct = cost != null && contractValue > 0 ? Math.round(((contractValue - cost) / contractValue) * 100) : null;
    const category = dominantCategory(pickHeadlineQuote(quotes), categories);

    return {
      project,
      quotes,
      changeOrders,
      contractValue,
      collectedTotal: collected,
      closed,
      hasMaterialsSheet,
      hasExpenses,
      cost,
      profit,
      marginPct,
      category,
      jobDate: jobDateOf(project),
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Avg. margin
// ---------------------------------------------------------------------------

/** Every priced job (headline quote reaches a real contract value) whose
 * job date falls in range — margin doesn't require the job to be closed
 * out, unlike Avg. job below. */
export function marginRowsInRange(rows: ProjectFinancials[], range: DateRange): ProjectFinancials[] {
  return rows.filter((r) => r.contractValue > 0 && withinRange(r.jobDate, range));
}

export interface AvgMarginResult {
  avgPct: number | null;
  includedCount: number;
  excludedCount: number;
}

/** Jobs with unknown cost are excluded from the average, not counted as
 * 0% — that would understate real margins. */
export function avgMargin(rows: ProjectFinancials[]): AvgMarginResult {
  const withCost = rows.filter((r) => r.marginPct != null);
  if (withCost.length === 0) {
    return { avgPct: null, includedCount: 0, excludedCount: rows.length };
  }
  const avgPct = Math.round(withCost.reduce((s, r) => s + r.marginPct!, 0) / withCost.length);
  return { avgPct, includedCount: withCost.length, excludedCount: rows.length - withCost.length };
}

// ---------------------------------------------------------------------------
// 6. Avg. job
// ---------------------------------------------------------------------------

/** "Closed" = fully collected (see isProjectClosed()) — derived, never a
 * manual status field, so a job that's actually been paid off never
 * silently sits out of this average because someone forgot to flip a
 * dropdown. */
export function closedJobRows(rows: ProjectFinancials[], range: DateRange): ProjectFinancials[] {
  return rows.filter((r) => r.closed && withinRange(r.jobDate, range));
}

export interface JobStats {
  count: number;
  avg: number;
  median: number;
  max: number;
  min: number;
}

export function jobStats(rows: ProjectFinancials[]): JobStats {
  const values = rows.map((r) => r.contractValue).sort((a, b) => a - b);
  const count = values.length;
  if (count === 0) return { count: 0, avg: 0, median: 0, max: 0, min: 0 };
  const avg = Math.round(values.reduce((s, v) => s + v, 0) / count);
  const median =
    count % 2 === 1 ? values[(count - 1) / 2] : Math.round((values[count / 2 - 1] + values[count / 2]) / 2);
  return { count, avg, median, max: values[count - 1], min: values[0] };
}

export interface JobSizeBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  count: number;
  amount: number;
}

const JOB_SIZE_BUCKET_DEFS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "under5k", label: "Under $5k", min: 0, max: 5_000 },
  { key: "5to15k", label: "$5k – $15k", min: 5_000, max: 15_000 },
  { key: "15to30k", label: "$15k – $30k", min: 15_000, max: 30_000 },
  { key: "30kplus", label: "$30k+", min: 30_000, max: Infinity },
];

export function jobSizeDistribution(rows: ProjectFinancials[]): JobSizeBucket[] {
  return JOB_SIZE_BUCKET_DEFS.map((def) => {
    const inBucket = rows.filter((r) => r.contractValue >= def.min && r.contractValue < def.max);
    return { ...def, count: inBucket.length, amount: inBucket.reduce((s, r) => s + r.contractValue, 0) };
  });
}

// ---------------------------------------------------------------------------
// 7. Invoiced by month
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  /** "2026-09" */
  key: string;
  /** "Sep 2026" */
  label: string;
  /** "Sep" */
  shortLabel: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

const monthKeyOf = (iso: string) => iso.slice(0, 7);

export function monthlyBreakdown(invoices: Invoice[], range: DateRange): MonthlyPoint[] {
  const inRange = invoices.filter((i) => isRealInvoice(i) && withinRange(i.created_at, range));
  const buckets = new Map<string, MonthlyPoint>();
  for (const inv of inRange) {
    const key = monthKeyOf(inv.created_at);
    if (!buckets.has(key)) {
      const d = new Date(`${key}-01T00:00:00`);
      buckets.set(key, {
        key,
        label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        shortLabel: d.toLocaleDateString("en-US", { month: "short" }),
        invoiced: 0,
        collected: 0,
        outstanding: 0,
        invoiceCount: 0,
      });
    }
    const bucket = buckets.get(key)!;
    bucket.invoiced += Number(inv.amount);
    bucket.invoiceCount += 1;
    if (inv.status === "paid") bucket.collected += Number(inv.amount);
    if (inv.status === "sent" || inv.status === "overdue") bucket.outstanding += Number(inv.amount);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Whether there's enough invoice history to make a same-period-last-year
 * comparison meaningful — the Invoiced-by-month page hides that toggle
 * until this is true. */
export function hasYearOfHistory(invoices: Invoice[], now: Date = new Date()): boolean {
  if (invoices.length === 0) return false;
  const earliest = invoices.reduce((min, i) => (i.created_at < min ? i.created_at : min), invoices[0].created_at);
  return now.getTime() - new Date(earliest).getTime() >= 365 * 86_400_000;
}

// ---------------------------------------------------------------------------
// 8. Monthly revenue points — Dashboard sparkline + "Revenue overview" chart.
// ---------------------------------------------------------------------------

export interface MonthPoint {
  key: string; // "2026-09"
  month: string; // "Sep"
  revenue: number;
}

const monthKeyShort = (isoDate: string) => isoDate.slice(0, 7);
const monthShortLabel = (isoDate: string) =>
  new Date(isoDate.slice(0, 10) + "T00:00:00").toLocaleString("en-US", { month: "short" });

/** Invoiced amounts summed per calendar month (by created_at), ascending —
 * excludes drafts. Explicitly labeled "invoiced" everywhere it's shown
 * (the Dashboard's "Revenue overview" chart); it is NOT the collected
 * basis the Dashboard's own headline "This month" card uses. */
export function monthlyRevenue(invoices: Invoice[]): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();
  for (const inv of invoices) {
    if (!isRealInvoice(inv)) continue;
    const key = monthKeyShort(inv.created_at);
    const point = buckets.get(key) ?? { key, month: monthShortLabel(inv.created_at), revenue: 0 };
    point.revenue += Number(inv.amount);
    buckets.set(key, point);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Same shape as monthlyRevenue(), but collected (paid, by paid_at) —
 * pairs with the Dashboard's own Collected-basis "This month" headline. */
export function monthlyCollected(invoices: Invoice[]): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const dateIso = inv.paid_at ?? inv.created_at;
    const key = monthKeyShort(dateIso);
    const point = buckets.get(key) ?? { key, month: monthShortLabel(dateIso), revenue: 0 };
    point.revenue += Number(inv.amount);
    buckets.set(key, point);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Percent change between the two most recent points present; null if not
 * computable. Works for either monthlyRevenue() or monthlyCollected(). */
export function momChange(points: MonthPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].revenue;
  const curr = points[points.length - 1].revenue;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// ---------------------------------------------------------------------------
// 9. Collected by category
// ---------------------------------------------------------------------------

export interface CategoryRow {
  id: string;
  name: string;
  /** Collected revenue attributed to this category — cash actually
   * received (see module doc comment on why "revenue" means collected). */
  revenue: number;
  jobCount: number;
  avgJobValue: number;
  marginPct: number | null;
}

/**
 * Revenue by category, on the collected (cash-received) basis. Each paid
 * invoice's dollar amount is split across categories in proportion to its
 * linked quote's included line items' category mix (so a $10k paid invoice
 * against a quote that's 70% "Patios" / 30% "Walls" attributes $7k/$3k). A
 * paid invoice with no quote, or whose quote has no categorized items,
 * counts its full amount toward Uncategorized — nothing silently drops out
 * of the total.
 *
 * Job count / avg job value / margin are project-level, not invoice-level
 * — each project counts once, toward its single dominant category (see
 * buildProjectFinancials), scoped by job date rather than invoice date.
 */
export function collectedByCategory(
  invoices: Invoice[],
  quotes: Quote[],
  categories: Category[],
  projectRows: ProjectFinancials[],
  range: DateRange,
): CategoryRow[] {
  const quotesById = new Map(quotes.map((q) => [q.id, q]));
  const revenueTotals = new Map<string, number>();
  const addRevenue = (id: string | null, amount: number) => {
    const key = id ?? "uncategorized";
    revenueTotals.set(key, (revenueTotals.get(key) ?? 0) + amount);
  };

  for (const inv of collectedInRange(invoices, range)) {
    const amount = Number(inv.amount);
    const quote = inv.quote_id ? quotesById.get(inv.quote_id) : undefined;
    if (!quote) {
      addRevenue(null, amount);
      continue;
    }
    const itemTotals = new Map<string, number>();
    let committedTotal = 0;
    for (const section of quote.quote_sections) {
      for (const item of section.quote_items ?? []) {
        if (!quoteItemIncluded(section, item)) continue;
        const key = item.category_id ?? "uncategorized";
        const lineTotal = quoteLineTotal(item);
        itemTotals.set(key, (itemTotals.get(key) ?? 0) + lineTotal);
        committedTotal += lineTotal;
      }
    }
    if (committedTotal <= 0) {
      addRevenue(null, amount);
      continue;
    }
    for (const [key, lineTotal] of itemTotals) {
      addRevenue(key === "uncategorized" ? null : key, (lineTotal / committedTotal) * amount);
    }
  }

  const jobs = marginRowsInRange(projectRows, range);
  const jobCounts = new Map<string, number>();
  const jobValueSums = new Map<string, number>();
  const marginSums = new Map<string, { profit: number; revenue: number }>();
  for (const job of jobs) {
    const key = job.category?.id ?? "uncategorized";
    jobCounts.set(key, (jobCounts.get(key) ?? 0) + 1);
    jobValueSums.set(key, (jobValueSums.get(key) ?? 0) + job.contractValue);
    if (job.profit != null) {
      const prev = marginSums.get(key) ?? { profit: 0, revenue: 0 };
      marginSums.set(key, { profit: prev.profit + job.profit, revenue: prev.revenue + job.contractValue });
    }
  }

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const allKeys = new Set([...revenueTotals.keys(), ...jobCounts.keys()]);

  return [...allKeys]
    .map((key) => {
      const jobCount = jobCounts.get(key) ?? 0;
      const jobValueSum = jobValueSums.get(key) ?? 0;
      const marginData = marginSums.get(key);
      return {
        id: key,
        name: key === "uncategorized" ? "Uncategorized" : (nameById.get(key) ?? "Uncategorized"),
        revenue: revenueTotals.get(key) ?? 0,
        jobCount,
        avgJobValue: jobCount > 0 ? Math.round(jobValueSum / jobCount) : 0,
        marginPct: marginData && marginData.revenue > 0 ? Math.round((marginData.profit / marginData.revenue) * 100) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// 10. Collected by client
// ---------------------------------------------------------------------------

export interface ClientRevenueRow {
  client: Client;
  /** Collected revenue (cash actually received) — same basis as
   * collectedByCategory, so the two always reconcile against the same
   * total collected figure for a given range. */
  revenue: number;
  pct: number;
  /** All-time job count — "how many jobs have we done for them," not
   * scoped to the selected range (unlike revenue). */
  jobCount: number;
  /** Current outstanding balance — a snapshot, not range-scoped, same as
   * the aging buckets on the Collected page. */
  outstanding: number;
  lastJobDate: string | null;
}

export function collectedByClient(
  invoices: Invoice[],
  projects: Project[],
  clients: Client[],
  range: DateRange,
): ClientRevenueRow[] {
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const revenueByClientId = new Map<string, number>();
  const outstandingByClientId = new Map<string, number>();

  for (const inv of invoices) {
    const project = inv.project_id ? projectsById.get(inv.project_id) : undefined;
    const clientId = project?.client_id;
    if (!clientId) continue;
    if (inv.status === "paid" && withinRange(inv.paid_at ?? inv.created_at, range)) {
      revenueByClientId.set(clientId, (revenueByClientId.get(clientId) ?? 0) + Number(inv.amount));
    }
    if (inv.status === "sent" || inv.status === "overdue") {
      outstandingByClientId.set(clientId, (outstandingByClientId.get(clientId) ?? 0) + Number(inv.amount));
    }
  }

  const jobCountByClientId = new Map<string, number>();
  const lastJobDateByClientId = new Map<string, string>();
  for (const p of projects) {
    if (!p.client_id) continue;
    jobCountByClientId.set(p.client_id, (jobCountByClientId.get(p.client_id) ?? 0) + 1);
    const prev = lastJobDateByClientId.get(p.client_id);
    if (!prev || p.created_at > prev) lastJobDateByClientId.set(p.client_id, p.created_at);
  }

  const totalRevenue = [...revenueByClientId.values()].reduce((a, b) => a + b, 0) || 1;

  return clients
    .map((client) => {
      const revenue = revenueByClientId.get(client.id) ?? 0;
      return {
        client,
        revenue,
        pct: Math.round((revenue / totalRevenue) * 100),
        jobCount: jobCountByClientId.get(client.id) ?? 0,
        outstanding: outstandingByClientId.get(client.id) ?? 0,
        lastJobDate: lastJobDateByClientId.get(client.id) ?? null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
