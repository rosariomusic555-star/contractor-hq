/* =============================================================================
 * Revenue page — shared calculation library.
 *
 * Every stat card on the Revenue page (This month, Collected, Avg. margin,
 * Avg. job) and every one of its 7 detail pages call into these same pure
 * functions, with the same input arrays, so a card and its detail page can
 * never disagree — "one calculation path per stat."
 * ========================================================================== */

import type {
  Category,
  ChangeOrder,
  Client,
  Invoice,
  MaterialsSection,
  MaterialsSheet,
  Project,
  Quote,
} from "./api";
import { materialsCogs, pickHeadlineQuote, projectContractValue, quoteItemIncluded, quoteLineTotal } from "./api";

// ---------------------------------------------------------------------------
// Date ranges — the one selector every detail page shares.
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
 * regardless of time-of-day.
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
// 1. Invoiced ("This month" card)
// ---------------------------------------------------------------------------

/** "Invoiced" = every invoice billed in range, any status — same definition
 * used everywhere else in the app that talks about what's been billed. */
export function invoicedInRange(invoices: Invoice[], range: DateRange): Invoice[] {
  return invoices.filter((i) => withinRange(i.created_at, range));
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
// Per-project financials — the shared building block behind Avg. margin,
// Avg. job, and Revenue by category's job counts.
// ---------------------------------------------------------------------------

export interface ProjectFinancials {
  project: Project;
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  /** projectContractValue() — the same "contract value" number shown on
   * the project page's own Profit Summary card. */
  revenue: number;
  hasMaterialsSheet: boolean;
  /** null when the project has no linked materials sheet at all — "cost
   * unknown," per the Avg. margin page's own spec, not zero. */
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

export function buildProjectFinancials(
  projects: Project[],
  quotesByProject: Map<string, Quote[]>,
  changeOrdersByProject: Map<string, ChangeOrder[]>,
  materialsSheets: MaterialsSheet[],
  materialsSections: MaterialsSection[],
  categories: Category[],
): ProjectFinancials[] {
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

  return projects.map((project) => {
    const quotes = quotesByProject.get(project.id) ?? [];
    const changeOrders = changeOrdersByProject.get(project.id) ?? [];
    const revenue = projectContractValue(quotes, changeOrders);
    const hasMaterialsSheet = (sheetsByProject.get(project.id) ?? []).length > 0;
    const cost = hasMaterialsSheet ? materialsCogs(sectionsByProject.get(project.id) ?? []) : null;
    const profit = cost != null ? revenue - cost : null;
    const marginPct = cost != null && revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null;
    const category = dominantCategory(pickHeadlineQuote(quotes), categories);
    return {
      project,
      quotes,
      changeOrders,
      revenue,
      hasMaterialsSheet,
      cost,
      profit,
      marginPct,
      category,
      jobDate: jobDateOf(project),
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Avg. margin
// ---------------------------------------------------------------------------

/** Every priced job (headline quote reaches a real contract value) whose
 * job date falls in range — margin doesn't require the job to be closed
 * out, unlike Avg. job below. */
export function marginRowsInRange(rows: ProjectFinancials[], range: DateRange): ProjectFinancials[] {
  return rows.filter((r) => r.revenue > 0 && withinRange(r.jobDate, range));
}

export interface AvgMarginResult {
  avgPct: number | null;
  includedCount: number;
  excludedCount: number;
}

/** Jobs with no linked materials sheet ("cost unknown") are excluded from
 * the average, not counted as 0% — that would understate real margins. */
export function avgMargin(rows: ProjectFinancials[]): AvgMarginResult {
  const withCost = rows.filter((r) => r.marginPct != null);
  if (withCost.length === 0) {
    return { avgPct: null, includedCount: 0, excludedCount: rows.length };
  }
  const avgPct = Math.round(withCost.reduce((s, r) => s + r.marginPct!, 0) / withCost.length);
  return { avgPct, includedCount: withCost.length, excludedCount: rows.length - withCost.length };
}

// ---------------------------------------------------------------------------
// 4. Avg. job
// ---------------------------------------------------------------------------

/** "Closed" = paid off — the pipeline's terminal status. */
export function closedJobRows(rows: ProjectFinancials[], range: DateRange): ProjectFinancials[] {
  return rows.filter((r) => r.project.status === "paid" && r.revenue > 0 && withinRange(r.jobDate, range));
}

export interface JobStats {
  count: number;
  avg: number;
  median: number;
  max: number;
  min: number;
}

export function jobStats(rows: ProjectFinancials[]): JobStats {
  const values = rows.map((r) => r.revenue).sort((a, b) => a - b);
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
    const inBucket = rows.filter((r) => r.revenue >= def.min && r.revenue < def.max);
    return { ...def, count: inBucket.length, amount: inBucket.reduce((s, r) => s + r.revenue, 0) };
  });
}

// ---------------------------------------------------------------------------
// 5. Invoiced by month
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
  const inRange = invoices.filter((i) => withinRange(i.created_at, range));
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
// 6. Revenue by category
// ---------------------------------------------------------------------------

export interface CategoryRow {
  id: string;
  name: string;
  /** Invoiced revenue attributed to this category — same basis as the
   * rest of the page (invoiced), not "fully paid quotes only". */
  revenue: number;
  jobCount: number;
  avgJobValue: number;
  marginPct: number | null;
}

/**
 * Revenue by category, on the same "invoiced" basis as the rest of the
 * Revenue page — replaces the old fully-paid-quote-only definition, which
 * silently showed "No fully paid quotes yet" on real businesses with real
 * invoiced revenue.
 *
 * Each invoice's dollar amount is split across categories in proportion to
 * its linked quote's included line items' category mix (so a $10k invoice
 * against a quote that's 70% "Patios" / 30% "Walls" attributes $7k/$3k).
 * An invoice with no quote, or whose quote has no categorized items,
 * counts its full amount toward Uncategorized — nothing silently drops
 * out of the total.
 *
 * Job count / avg job value / margin are project-level, not invoice-level
 * — each project counts once, toward its single dominant category (see
 * buildProjectFinancials), scoped by job date rather than invoice date.
 */
export function revenueByCategoryInvoiced(
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

  for (const inv of invoicedInRange(invoices, range)) {
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
    jobValueSums.set(key, (jobValueSums.get(key) ?? 0) + job.revenue);
    if (job.profit != null) {
      const prev = marginSums.get(key) ?? { profit: 0, revenue: 0 };
      marginSums.set(key, { profit: prev.profit + job.profit, revenue: prev.revenue + job.revenue });
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
// 7. Revenue by client
// ---------------------------------------------------------------------------

export interface ClientRevenueRow {
  client: Client;
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

export function revenueByClient(
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
    if (withinRange(inv.created_at, range)) {
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
