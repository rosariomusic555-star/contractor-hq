/**
 * Revenue & profitability report — the one place the Revenue page's numbers
 * come from, and what Business health / the Dashboard share with it. Pure,
 * over fetched rows; built on the shared money helpers.
 *
 * Three revenue bases (never mixed):
 *   booked     signed contract value, dated when it was signed — an approved
 *              original or add-on quote at quoteTotal (required + chosen
 *              optionals + client selections) on its signed date, and an
 *              approved change order at its amount on its approval date.
 *              Unsigned quotes never count.
 *   invoiced   non-draft invoices, dated by when they were created (there is
 *              no separate "sent" date), at their amount.
 *   collected  active (not voided) payments, dated by the day paid, applied
 *              or not yet applied. (No refunds exist: payments are > 0 and a
 *              mistake is voided.)
 *
 * Profit is on jobs COMPLETED in the period (status complete, dated by
 * completed_at, else the end date): the job's closeout when it has one
 * (frozen actuals), otherwise the live Planned vs actual report — the same
 * numbers the project page and closeout show. Margin is dollar-weighted:
 * Σ profit ÷ Σ price.
 */
import type {
  ChangeOrder,
  Client,
  Expense,
  ExpenseCategory,
  Invoice,
  LaborEntry,
  LeadSourceSpend,
  MaterialOrder,
  MaterialsSection,
  MaterialsUsageLog,
  Opportunity,
  Payment,
  Project,
  Quote,
  Category,
  Crew,
} from "./api";
import { pickHeadlineQuote, quoteTotal } from "./api";
import type { Closeout } from "./closeout";
import type { ProjectFeature } from "./features";
import { countsTowardTotals } from "./features";
import { isExcludedFromFinancials, localDateOf } from "./financials";
import { isMaintenanceJob } from "./maintenance";
import { needsReconciliation, type DeliveryLineWithOrderStatus, purchasedLines } from "./materialTracking";
import { plannedActualReport } from "./plannedActual";
import { isActivePayment, paymentUnallocated, paymentMethodLabel } from "./projectMoney";
import { sectionIncluded } from "./selections";

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "ytd" | "last_year" | "last_12" | "custom";
export type CompareKey = "previous" | "last_year" | "none";
export type RevenueBasis = "booked" | "invoiced" | "collected";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "last_year", label: "Last year" },
  { key: "last_12", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
];

export const BASIS_META: Record<RevenueBasis, { label: string; help: string }> = {
  booked: { label: "Booked", help: "Signed contract value, by the day it was signed (original + add-on quotes, approved change orders)." },
  invoiced: { label: "Invoiced", help: "Invoices sent (not drafts), by the day each was created." },
  collected: { label: "Collected", help: "Payments received, by the day paid — voided payments left out." },
};

export interface Period {
  key: PeriodKey | "compare";
  /** Inclusive, local midnight. */
  start: Date;
  /** Exclusive. */
  end: Date;
  label: string;
}

const day = (y: number, m: number, d: number) => new Date(y, m, d);
const addMonths = (d: Date, n: number) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
};
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const periodLabel = (p: Period) => `${fmtDay(p.start)} – ${fmtDay(new Date(p.end.getTime() - 86_400_000))}`;

/** A preset (or custom "yyyy-mm-dd" bounds) → concrete [start, end). Ranges
 * that run to "now" end tomorrow, so today counts at any hour. */
export function resolvePeriod(key: PeriodKey, custom?: { start: string; end: string }, now: Date = new Date()): Period {
  const t = day(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = day(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  const label = PERIOD_OPTIONS.find((o) => o.key === key)?.label ?? "Custom";
  switch (key) {
    case "this_month":
      return { key, start: day(t.getFullYear(), t.getMonth(), 1), end: tomorrow, label };
    case "last_month":
      return { key, start: day(t.getFullYear(), t.getMonth() - 1, 1), end: day(t.getFullYear(), t.getMonth(), 1), label };
    case "this_quarter":
      return { key, start: day(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1), end: tomorrow, label };
    case "ytd":
      return { key, start: day(t.getFullYear(), 0, 1), end: tomorrow, label };
    case "last_year":
      return { key, start: day(t.getFullYear() - 1, 0, 1), end: day(t.getFullYear(), 0, 1), label };
    case "last_12":
      return { key, start: day(t.getFullYear(), t.getMonth() - 11, 1), end: tomorrow, label };
    case "custom": {
      const s = custom?.start ? localDateOf(custom.start) : day(t.getFullYear(), t.getMonth(), 1);
      const e = custom?.end ? localDateOf(custom.end) : t;
      return { key, start: s, end: day(e.getFullYear(), e.getMonth(), e.getDate() + 1), label };
    }
  }
}

/** The comparison window: "previous" = the same span just before (a whole
 * number of months for the calendar presets — this month vs last month,
 * this quarter-to-date vs the same days of last quarter; a custom range by
 * its day count); "last_year" = the same dates a year earlier. */
export function comparePeriod(p: Period, compare: CompareKey): Period | null {
  if (compare === "none") return null;
  const months =
    compare === "last_year"
      ? 12
      : p.key === "this_month" || p.key === "last_month"
        ? 1
        : p.key === "this_quarter"
          ? 3
          : p.key === "ytd" || p.key === "last_year" || p.key === "last_12"
            ? 12
            : null;
  if (months != null) return { key: "compare", start: addMonths(p.start, -months), end: addMonths(p.end, -months), label: compare === "last_year" ? "Same period last year" : "Previous period" };
  // By calendar days, not milliseconds — a DST change in between would shift it an hour into the day before.
  const days = Math.round((p.end.getTime() - p.start.getTime()) / 86_400_000);
  return { key: "compare", start: day(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() - days), end: day(p.start.getFullYear(), p.start.getMonth(), p.start.getDate()), label: "Previous period" };
}

const localIso = (iso: string) => isoOf(localDateOf(iso));
export const inPeriod = (dateIso: string | null | undefined, p: Period) => {
  if (!dateIso) return false;
  const d = localDateOf(dateIso.length > 10 ? localIso(dateIso) : dateIso);
  return d >= p.start && d < p.end;
};

// ---------------------------------------------------------------------------
// The three bases
// ---------------------------------------------------------------------------

export type BookedKind = "original" | "addon" | "change_order";
export interface RevenueItem {
  key: string;
  date: string; // local yyyy-mm-dd
  amount: number;
  projectId: string | null;
  clientId: string | null;
  label: string;
  kind: BookedKind | "invoice" | "payment";
  method?: string;
  href: string;
}

/** Booked: signed contracts only, dated by signing (see the file header). */
export function bookedItems(projects: Project[], quotes: Quote[], changeOrders: ChangeOrder[]): RevenueItem[] {
  const byId = new Map(projects.filter((p) => !isExcludedFromFinancials(p.status)).map((p) => [p.id, p]));
  const out: RevenueItem[] = [];
  for (const q of quotes) {
    if (q.status !== "approved" || !q.project_id) continue;
    const p = byId.get(q.project_id);
    if (!p) continue;
    const signed = q.signed_at ?? q.updated_at ?? q.created_at;
    out.push({
      key: `q-${q.id}`,
      date: localIso(signed),
      amount: r2(quoteTotal(q.quote_sections)),
      projectId: p.id,
      clientId: p.client_id,
      label: `${(q.kind ?? "original") === "addon" ? "Add-on quote" : "Signed quote"} · ${p.name}`,
      kind: (q.kind ?? "original") === "addon" ? "addon" : "original",
      href: `/projects/${p.id}/quotes/${q.id}`,
    });
  }
  for (const co of changeOrders) {
    if (co.status !== "approved" || !co.approved_at) continue;
    const p = byId.get(co.project_id);
    if (!p) continue;
    out.push({
      key: `co-${co.id}`,
      date: localIso(co.approved_at),
      amount: r2(Number(co.amount)),
      projectId: p.id,
      clientId: p.client_id,
      label: `Change order · ${co.title || p.name}`,
      kind: "change_order",
      href: `/projects/${p.id}/change-orders/${co.id}`,
    });
  }
  return out;
}

export function invoicedItems(invoices: Invoice[], projects: Project[]): RevenueItem[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return invoices
    .filter((i) => i.status !== "draft")
    .map((i) => {
      const p = i.project_id ? byId.get(i.project_id) : undefined;
      return {
        key: `inv-${i.id}`,
        date: localIso(i.created_at),
        amount: r2(Number(i.amount)),
        projectId: i.project_id ?? null,
        clientId: p?.client_id ?? (i as { client_id?: string | null }).client_id ?? null,
        label: `${i.invoice_number ?? "Invoice"}${p ? ` · ${p.name}` : ""}`,
        kind: "invoice" as const,
        href: i.project_id ? `/projects/${i.project_id}/invoices/${i.id}` : `/invoices/${i.id}`,
      };
    });
}

export function collectedItems(payments: Payment[], projects: Project[]): RevenueItem[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return payments.filter(isActivePayment).map((pm) => {
    const p = pm.project_id ? byId.get(pm.project_id) : undefined;
    return {
      key: `pay-${pm.id}`,
      date: pm.paid_on.slice(0, 10),
      amount: r2(Number(pm.amount)),
      projectId: pm.project_id ?? null,
      clientId: p?.client_id ?? pm.project?.client_id ?? null,
      label: `${pm.receipt_number ? `${pm.receipt_number} · ` : ""}${paymentMethodLabel(pm.method)}${p ? ` · ${p.name}` : ""}`,
      kind: "payment" as const,
      method: pm.method,
      href: pm.project_id ? `/projects/${pm.project_id}/invoices` : "/revenue",
    };
  });
}

export const sumIn = (items: RevenueItem[], p: Period) => r2(items.reduce((s, i) => s + (inPeriod(i.date, p) ? i.amount : 0), 0));
export const itemsIn = (items: RevenueItem[], p: Period) => items.filter((i) => inPeriod(i.date, p));
export const pctChange = (now: number, before: number | null | undefined) => (before == null || before === 0 ? null : ((now - before) / Math.abs(before)) * 100);

// ---------------------------------------------------------------------------
// Profit per job
// ---------------------------------------------------------------------------

export interface JobProfit {
  projectId: string;
  price: number;
  cost: number;
  profit: number;
  fullyLoaded: number | null;
  expected: number;
  expectedFullyLoaded: number | null;
  source: "closeout" | "live";
  closeoutId: string | null;
  /** Completion date for a complete job, else null. */
  completedOn: string | null;
  /** By feature: price / actual cost (for the feature breakdown). */
  features: { categoryId: string | null; name: string; price: number; cost: number }[];
}

export interface ProfitInputs {
  projects: Project[];
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  sections: MaterialsSection[];
  expenses: Expense[];
  expenseCategories: Pick<ExpenseCategory, "id" | "cost_type">[];
  laborEntries: LaborEntry[];
  materialOrders: MaterialOrder[];
  usageLogs: MaterialsUsageLog[];
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  closeouts: Closeout[];
  /** Current overhead burden $/man-hour (burdenPerHour), for jobs with no stored rate. */
  burden: number | null;
}

const group = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(r);
    else m.set(k, [r]);
  }
  return m;
};

export const completionDateOf = (p: Project) => (p.completed_at ? localIso(p.completed_at) : (p.actual_end_date ?? p.scheduled_end_date ?? null));

/** Profit for every job (lazily per project): the closeout's frozen report
 * for a closed-out job, else the live Planned vs actual report — both the
 * same numbers the project page and closeout show. */
export function makeJobProfit(input: ProfitInputs): (projectId: string) => JobProfit | null {
  const byProject = {
    quotes: group(input.quotes, (q) => q.project_id),
    cos: group(input.changeOrders, (c) => c.project_id),
    sections: group(input.sections, (s) => s.project_id),
    expenses: group(input.expenses, (e) => e.project_id),
    labor: group(input.laborEntries, (l) => l.project_id),
    orders: group(input.materialOrders, (o) => o.project_id),
    features: group(input.features, (f) => f.project_id),
  };
  const usageByItem = group(input.usageLogs, (u) => u.materials_item_id);
  const closeoutFor = new Map<string, Closeout>();
  for (const c of [...input.closeouts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (c.superseded_at || c.excluded) continue;
    closeoutFor.set(c.project_id, c);
  }
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const catName = (id: string | null) => (id ? (input.categories.find((c) => c.id === id)?.name ?? "Feature") : "General");
  const cache = new Map<string, JobProfit | null>();
  return (projectId) => {
    if (cache.has(projectId)) return cache.get(projectId)!;
    const p = projectById.get(projectId);
    if (!p) return null;
    const co = closeoutFor.get(projectId);
    let out: JobProfit | null;
    const featureRow = (f: { featureId: string | null; categoryId: string | null; name: string; price: number; total: { actual: number } }) => ({
      categoryId: f.categoryId,
      name: f.featureId ? (f.categoryId ? catName(f.categoryId) : f.name) : "General",
      price: f.price,
      cost: f.total.actual,
    });
    if (co?.snapshot?.report) {
      const rep = co.snapshot.report;
      out = {
        projectId,
        price: r2(rep.project.price),
        cost: r2(rep.project.total.actual),
        profit: r2(rep.profit.actual),
        fullyLoaded: rep.profit.actualFullyLoaded,
        expected: r2(rep.profit.expected),
        expectedFullyLoaded: rep.profit.expectedFullyLoaded,
        source: "closeout",
        closeoutId: co.id,
        completedOn: co.completed_on,
        features: rep.features.map(featureRow),
      };
    } else {
      const quotes = byProject.quotes.get(projectId) ?? [];
      const sections = byProject.sections.get(projectId) ?? [];
      const orders = byProject.orders.get(projectId) ?? [];
      const deliveries: DeliveryLineWithOrderStatus[] = purchasedLines(orders);
      const lines = sections.filter(countsTowardTotals).flatMap((s) => s.materials_items).filter((i) => (i.cost_type ?? "material") === "material");
      const usageLogs = lines.flatMap((l) => usageByItem.get(l.id) ?? []);
      const reconciled = lines.length > 0 && needsReconciliation(lines, deliveries, usageLogs).length === 0;
      const headline = pickHeadlineQuote(quotes);
      const rate = p.overhead_rate != null ? Number(p.overhead_rate) : headline?.overhead_rate != null ? Number(headline.overhead_rate) : input.burden;
      const rep = plannedActualReport({
        features: byProject.features.get(projectId) ?? [],
        categories: input.categories,
        sections,
        quotes,
        changeOrders: byProject.cos.get(projectId) ?? [],
        expenses: byProject.expenses.get(projectId) ?? [],
        expenseCategories: input.expenseCategories,
        laborEntries: byProject.labor.get(projectId) ?? [],
        deliveries,
        usageLogs,
        materialsCounted: p.status === "complete",
        overheadRate: rate,
      });
      out = {
        projectId,
        price: r2(rep.project.price),
        cost: r2(rep.project.total.actual),
        profit: r2(rep.profit.actual),
        fullyLoaded: rep.profit.actualFullyLoaded,
        expected: r2(rep.profit.expected),
        expectedFullyLoaded: rep.profit.expectedFullyLoaded,
        source: "live",
        closeoutId: null,
        completedOn: p.status === "complete" ? completionDateOf(p) : null,
        features: rep.features.map(featureRow),
      };
    }
    cache.set(projectId, out);
    return out;
  };
}

/** Jobs completed in the period, with their profit. */
export function completedJobs(projects: Project[], jobProfit: (id: string) => JobProfit | null, p: Period): JobProfit[] {
  return projects
    .filter((x) => x.status === "complete")
    .map((x) => jobProfit(x.id))
    .filter((j): j is JobProfit => !!j && !!j.completedOn && inPeriod(j.completedOn, p) && j.price > 0);
}

export function profitTotals(jobs: JobProfit[]) {
  const price = jobs.reduce((s, j) => s + j.price, 0);
  const profit = jobs.reduce((s, j) => s + j.profit, 0);
  const loadedJobs = jobs.filter((j) => j.fullyLoaded != null);
  const fullyLoaded = loadedJobs.length ? loadedJobs.reduce((s, j) => s + (j.fullyLoaded ?? 0), 0) : null;
  const expected = jobs.reduce((s, j) => s + j.expected, 0);
  return {
    count: jobs.length,
    price: r2(price),
    profit: r2(profit),
    fullyLoaded: fullyLoaded == null ? null : r2(fullyLoaded),
    /** Dollar-weighted: Σ profit ÷ Σ price. */
    marginPct: price > 0 ? (profit / price) * 100 : null,
    fullyLoadedPct: fullyLoaded != null && price > 0 ? (fullyLoaded / price) * 100 : null,
    expected: r2(expected),
    variance: r2(profit - expected),
  };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface RevenueReportInput extends ProfitInputs {
  invoices: Invoice[];
  payments: Payment[];
  clients: Client[];
  opportunities: Opportunity[];
  crews: Pick<Crew, "id" | "name">[];
  spend: LeadSourceSpend[];
  period: Period;
  compare: Period | null;
  basis: RevenueBasis;
  now?: Date;
}

export interface BreakdownRow {
  key: string;
  label: string;
  amount: number;
  count: number;
  extra?: Record<string, number | string | boolean | null>;
}

export function revenueReport(input: RevenueReportInput) {
  const { period, compare, basis } = input;
  const booked = bookedItems(input.projects, input.quotes, input.changeOrders);
  const invoiced = invoicedItems(input.invoices, input.projects);
  const collected = collectedItems(input.payments, input.projects);
  const itemsOf: Record<RevenueBasis, RevenueItem[]> = { booked, invoiced, collected };
  const basisItems = itemsOf[basis];
  const jobProfit = makeJobProfit(input);
  const projectById = new Map(input.projects.map((p) => [p.id, p]));

  // Headline.
  const totals = (p: Period) => ({
    booked: sumIn(booked, p),
    invoiced: sumIn(invoiced, p),
    collected: sumIn(collected, p),
  });
  const now = totals(period);
  const before = compare ? totals(compare) : null;
  const wonNow = itemsIn(booked, period).filter((i) => i.kind === "original");
  const wonBefore = compare ? itemsIn(booked, compare).filter((i) => i.kind === "original") : null;
  const upsell = r2(itemsIn(booked, period).filter((i) => i.kind !== "original").reduce((s, i) => s + i.amount, 0));
  const completed = completedJobs(input.projects, jobProfit, period);
  const completedBefore = compare ? completedJobs(input.projects, jobProfit, compare) : null;
  const profit = profitTotals(completed);
  const profitBefore = completedBefore ? profitTotals(completedBefore) : null;

  // Trend: 12 months ending with the period (or the period's months if longer).
  const endMonth = new Date(period.end.getTime() - 86_400_000);
  const spanMonths = (period.end.getFullYear() - period.start.getFullYear()) * 12 + (endMonth.getMonth() - period.start.getMonth()) + 1;
  const monthsBack = Math.max(12, Math.min(36, spanMonths));
  const monthKeys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthSum = (items: RevenueItem[]) => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.date.slice(0, 7), (m.get(i.date.slice(0, 7)) ?? 0) + i.amount);
    return m;
  };
  const sums = { booked: monthSum(booked), invoiced: monthSum(invoiced), collected: monthSum(collected) };
  const profitByMonth = new Map<string, number>();
  for (const x of input.projects) {
    if (x.status !== "complete") continue;
    const j = jobProfit(x.id);
    if (!j?.completedOn || j.price <= 0) continue;
    const k = j.completedOn.slice(0, 7);
    profitByMonth.set(k, (profitByMonth.get(k) ?? 0) + j.profit);
  }
  const lastYearKey = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
  const trend = monthKeys.map((k) => ({
    month: k,
    booked: r2(sums.booked.get(k) ?? 0),
    invoiced: r2(sums.invoiced.get(k) ?? 0),
    collected: r2(sums.collected.get(k) ?? 0),
    lastYear: r2(sums[basis].get(lastYearKey(k)) ?? 0),
    profit: profitByMonth.has(k) ? r2(profitByMonth.get(k)!) : null,
  }));

  // Seasonality: the basis by year × month, every year with data.
  const years = [...new Set([...sums[basis].keys()].map((k) => Number(k.slice(0, 4))))].sort();
  const seasonality = years.map((y) => ({
    year: y,
    months: Array.from({ length: 12 }, (_, m) => r2(sums[basis].get(`${y}-${String(m + 1).padStart(2, "0")}`) ?? 0)),
  }));

  // By client (selected basis).
  const clientName = new Map(input.clients.map((c) => [c.id, c.name]));
  const wonProjectsByClient = new Map<string, Set<string>>();
  for (const b of booked) if (b.kind === "original" && b.clientId && b.projectId) wonProjectsByClient.set(b.clientId, (wonProjectsByClient.get(b.clientId) ?? new Set()).add(b.projectId));
  const maintenanceClients = new Set(input.projects.filter((p) => isMaintenanceJob(p) && p.client_id).map((p) => p.client_id!));
  const byClientMap = new Map<string, BreakdownRow>();
  for (const i of itemsIn(basisItems, period)) {
    const k = i.clientId ?? "none";
    const row = byClientMap.get(k) ?? {
      key: k,
      label: i.clientId ? (clientName.get(i.clientId) ?? "Client") : "No client",
      amount: 0,
      count: 0,
      extra: { repeat: !!i.clientId && (wonProjectsByClient.get(i.clientId)?.size ?? 0) >= 2, maintenance: !!i.clientId && maintenanceClients.has(i.clientId) },
    };
    row.amount = r2(row.amount + i.amount);
    row.count++;
    byClientMap.set(k, row);
  }
  const byClient = [...byClientMap.values()].sort((a, b) => b.amount - a.amount);

  // Revenue type (booked).
  const typeRows: Record<string, BreakdownRow> = {
    original: { key: "original", label: "Original contracts", amount: 0, count: 0 },
    change_order: { key: "change_order", label: "Change orders", amount: 0, count: 0 },
    addon: { key: "addon", label: "Add-on quotes", amount: 0, count: 0 },
    maintenance: { key: "maintenance", label: "Maintenance jobs", amount: 0, count: 0 },
  };
  for (const i of itemsIn(booked, period)) {
    const p = i.projectId ? projectById.get(i.projectId) : undefined;
    const k = i.kind === "original" && p && isMaintenanceJob(p) ? "maintenance" : i.kind;
    typeRows[k].amount = r2(typeRows[k].amount + i.amount);
    typeRows[k].count++;
  }
  const revenueType = Object.values(typeRows);

  // By lead source (booked in the period; ad spend in the same months).
  const sourceOf = new Map<string, string>();
  for (const o of input.opportunities) if (o.project_id) sourceOf.set(o.project_id, o.lead_source?.trim() || "Unknown");
  const leadMap = new Map<string, { amount: number; jobs: Set<string> }>();
  for (const i of itemsIn(booked, period)) {
    const src = (i.projectId && sourceOf.get(i.projectId)) || "Unknown";
    const row = leadMap.get(src) ?? { amount: 0, jobs: new Set() };
    row.amount += i.amount;
    if (i.kind === "original" && i.projectId) row.jobs.add(i.projectId);
    leadMap.set(src, row);
  }
  const spendIn = new Map<string, number>();
  for (const s of input.spend) if (inPeriod(s.month, period)) spendIn.set(s.lead_source, (spendIn.get(s.lead_source) ?? 0) + Number(s.amount));
  for (const src of spendIn.keys()) if (!leadMap.has(src)) leadMap.set(src, { amount: 0, jobs: new Set() });
  const byLeadSource: BreakdownRow[] = [...leadMap.entries()]
    .map(([src, r]) => {
      const spend = spendIn.get(src) ?? 0;
      return { key: src, label: src, amount: r2(r.amount), count: r.jobs.size, extra: { spend: r2(spend), roas: spend > 0 ? r.amount / spend : null } };
    })
    .sort((a, b) => b.amount - a.amount);

  // By feature (booked in the period, split by the quote / change order
  // section's feature) + margin from the completed jobs' feature reports.
  const featureCat = new Map(input.features.map((f) => [f.id, f.category_id]));
  const catName = (id: string | null) => (id ? (input.categories.find((c) => c.id === id)?.name ?? "Feature") : "General / unassigned");
  const featMap = new Map<string, { label: string; amount: number; jobs: Set<string>; price: number; cost: number }>();
  const addFeat = (catId: string | null, amount: number, projectId: string | null) => {
    const k = catId ?? "general";
    const row = featMap.get(k) ?? { label: catName(catId), amount: 0, jobs: new Set<string>(), price: 0, cost: 0 };
    row.amount += amount;
    if (projectId) row.jobs.add(projectId);
    featMap.set(k, row);
  };
  const quoteById = new Map(input.quotes.map((q) => [q.id, q]));
  const coById = new Map(input.changeOrders.map((c) => [c.id, c]));
  for (const i of itemsIn(booked, period)) {
    if (i.kind === "change_order") {
      const co = coById.get(i.key.slice(3));
      const secs = co?.change_order_sections ?? [];
      let rest = i.amount;
      for (const s of secs) {
        const amt = (s.change_order_items ?? []).reduce((t, it) => t + Number(it.price) * (it.quantity == null ? 1 : Number(it.quantity)), 0);
        if (!amt) continue;
        addFeat(s.feature_id ? (featureCat.get(s.feature_id) ?? null) : null, amt, i.projectId);
        rest -= amt;
      }
      if (Math.abs(rest) > 0.005) addFeat(null, rest, i.projectId);
      continue;
    }
    const q = quoteById.get(i.key.slice(2));
    if (!q) continue;
    let rest = i.amount;
    for (const s of q.quote_sections ?? []) {
      if (!sectionIncluded(s)) continue;
      const amt = quoteTotal([s]);
      if (!amt) continue;
      addFeat(s.feature_id ? (featureCat.get(s.feature_id) ?? null) : null, amt, i.projectId);
      rest -= amt;
    }
    if (Math.abs(rest) > 0.005) addFeat(null, rest, i.projectId);
  }
  for (const j of completed) {
    for (const f of j.features) {
      const k = f.categoryId ?? "general";
      const row = featMap.get(k) ?? { label: f.categoryId ? catName(f.categoryId) : "General / unassigned", amount: 0, jobs: new Set<string>(), price: 0, cost: 0 };
      row.price += f.price;
      row.cost += f.cost;
      featMap.set(k, row);
    }
  }
  const byFeature: BreakdownRow[] = [...featMap.entries()]
    .map(([k, r]) => ({
      key: k,
      label: r.label,
      amount: r2(r.amount),
      count: r.jobs.size,
      extra: { avg: r.jobs.size ? r2(r.amount / r.jobs.size) : null, marginPct: r.price > 0 ? ((r.price - r.cost) / r.price) * 100 : null, completedPrice: r2(r.price) },
    }))
    .filter((r) => r.amount !== 0 || (r.extra.completedPrice as number) > 0)
    .sort((a, b) => b.amount - a.amount);

  // By crew (completed jobs).
  const crewName = new Map(input.crews.map((c) => [c.id, c.name]));
  const crewMap = new Map<string, BreakdownRow>();
  for (const j of completed) {
    const cid = projectById.get(j.projectId)?.crew_id ?? null;
    const k = cid ?? "none";
    const row = crewMap.get(k) ?? { key: k, label: cid ? (crewName.get(cid) ?? "Crew") : "No crew assigned", amount: 0, count: 0, extra: { profit: 0 } };
    row.amount = r2(row.amount + j.price);
    row.count++;
    row.extra!.profit = r2((row.extra!.profit as number) + j.profit);
    crewMap.set(k, row);
  }
  const byCrew = [...crewMap.values()].map((r) => ({ ...r, extra: { ...r.extra, marginPct: r.amount > 0 ? ((r.extra!.profit as number) / r.amount) * 100 : null } })).sort((a, b) => b.amount - a.amount);

  // Payment methods (collected).
  const methodMap = new Map<string, BreakdownRow>();
  for (const i of itemsIn(collected, period)) {
    const k = i.method ?? "other";
    const row = methodMap.get(k) ?? { key: k, label: paymentMethodLabel(k as Payment["method"]), amount: 0, count: 0 };
    row.amount = r2(row.amount + i.amount);
    row.count++;
    methodMap.set(k, row);
  }
  const paymentMethods = [...methodMap.values()].sort((a, b) => b.amount - a.amount);

  // Jobs with activity in the period.
  const active = new Set<string>();
  for (const list of [booked, invoiced, collected]) for (const i of itemsIn(list, period)) if (i.projectId) active.add(i.projectId);
  for (const j of completed) active.add(j.projectId);
  const signedByProject = new Map<string, number>();
  for (const b of booked) if (b.projectId) signedByProject.set(b.projectId, (signedByProject.get(b.projectId) ?? 0) + b.amount);
  const invByProject = new Map<string, number>();
  for (const i of invoiced) if (i.projectId) invByProject.set(i.projectId, (invByProject.get(i.projectId) ?? 0) + i.amount);
  const colByProject = new Map<string, number>();
  for (const i of collected) if (i.projectId) colByProject.set(i.projectId, (colByProject.get(i.projectId) ?? 0) + i.amount);
  const sourceFor = (id: string) => sourceOf.get(id) ?? "Unknown";
  const jobs = [...active]
    .map((id) => {
      const p = projectById.get(id);
      if (!p) return null;
      const j = jobProfit(id);
      return {
        projectId: id,
        name: p.name,
        client: p.client?.name ?? (p.client_id ? clientName.get(p.client_id) : null) ?? null,
        status: p.status,
        contract: r2(signedByProject.get(id) ?? 0),
        invoiced: r2(invByProject.get(id) ?? 0),
        collected: r2(colByProject.get(id) ?? 0),
        price: j?.price ?? null,
        cost: j?.cost ?? null,
        profit: j?.profit ?? null,
        fullyLoaded: j?.fullyLoaded ?? null,
        marginPct: j && j.price > 0 ? (j.profit / j.price) * 100 : null,
        variance: j ? r2(j.profit - j.expected) : null,
        closeoutId: j?.closeoutId ?? null,
        crewId: p.crew_id ?? null,
        leadSource: sourceFor(id),
        featureCategoryIds: [...new Set((input.features.filter((f) => f.project_id === id && f.status === "active")).map((f) => f.category_id))],
        completedOn: j?.completedOn ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.contract - a!.contract) as JobRow[];

  // Adjustments / reconciliation.
  const unallocated = input.payments
    .filter((pm) => isActivePayment(pm) && inPeriod(pm.paid_on, period) && paymentUnallocated(pm) > 0.005)
    .map((pm) => ({ id: pm.id, amount: r2(paymentUnallocated(pm)), paidOn: pm.paid_on, projectId: pm.project_id, label: `${pm.receipt_number ?? "Payment"}${pm.project?.name ? ` · ${pm.project.name}` : ""}` }));
  const voided = input.payments
    .filter((pm) => pm.status === "void" && pm.voided_at && inPeriod(pm.voided_at, period))
    .map((pm) => ({ id: pm.id, amount: r2(Number(pm.amount)), voidedAt: pm.voided_at!, reason: pm.void_reason ?? null, projectId: pm.project_id, label: `${pm.receipt_number ?? "Payment"}${pm.project?.name ? ` · ${pm.project.name}` : ""}` }));

  return {
    items: itemsOf,
    headline: {
      now,
      before,
      jobsWon: wonNow.length,
      jobsWonBefore: wonBefore?.length ?? null,
      avgJob: wonNow.length ? r2(wonNow.reduce((s, i) => s + i.amount, 0) / wonNow.length) : null,
      avgJobBefore: wonBefore?.length ? r2(wonBefore.reduce((s, i) => s + i.amount, 0) / wonBefore.length) : null,
      upsell,
      upsellPct: now.booked > 0 ? (upsell / now.booked) * 100 : null,
      profit,
      profitBefore,
    },
    completed,
    trend,
    seasonality,
    byClient,
    byLeadSource,
    byFeature,
    byCrew,
    revenueType,
    paymentMethods,
    jobs,
    unallocated,
    voided,
  };
}

export interface JobRow {
  projectId: string;
  name: string;
  client: string | null;
  status: string;
  contract: number;
  invoiced: number;
  collected: number;
  /** The job's price in its profit report (approved quotes + change orders). */
  price: number | null;
  cost: number | null;
  profit: number | null;
  fullyLoaded: number | null;
  marginPct: number | null;
  variance: number | null;
  closeoutId: string | null;
  crewId: string | null;
  leadSource: string;
  featureCategoryIds: (string | null)[];
  completedOn: string | null;
}

export type RevenueReport = ReturnType<typeof revenueReport>;
