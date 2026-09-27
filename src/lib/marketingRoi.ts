/* =============================================================================
 * Marketing ROI by lead source (0128) — the one place the math lives.
 *
 * Everything is month-granular. Attribution:
 *   - a lead counts in the month it was created (opportunities.created_at);
 *   - spend counts in its month;
 *   - won revenue / profit belongs to the lead's source for leads created in
 *     the period, even if the job was won later.
 * Free sources (lead_sources.paid = false, or a source nobody entered spend
 * for and that isn't in the list) show "—" for every spend metric.
 * Reporting only — nothing here feeds job costs or overhead.
 * ========================================================================== */

export type PeriodKey = "this_month" | "last_month" | "last_3" | "last_6" | "last_12" | "ytd" | "custom";

export const PERIOD_PRESETS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3", label: "Last 3 months" },
  { key: "last_6", label: "Last 6 months" },
  { key: "last_12", label: "Last 12 months" },
  { key: "ytd", label: "Year to date" },
];

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-09" from a Date, in local time. */
export const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** Local "YYYY-MM" of an ISO timestamp (a lead created 11pm on the 31st
 * belongs to that month where the contractor is, not UTC's next month). */
export const monthOfIso = (iso: string) => (iso.length <= 10 ? iso.slice(0, 7) : ym(new Date(iso)));

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 120; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface Period {
  key: PeriodKey;
  from: string; // YYYY-MM inclusive
  to: string; // YYYY-MM inclusive
  months: string[];
  label: string;
}

export function resolvePeriod(key: PeriodKey, custom: { from: string; to: string } | null, now = new Date()): Period {
  const cur = ym(now);
  const mk = (from: string, to: string, label: string): Period => {
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { key, from: a, to: b, months: monthsBetween(a, b), label };
  };
  switch (key) {
    case "this_month":
      return mk(cur, cur, "This month");
    case "last_month":
      return mk(addMonths(cur, -1), addMonths(cur, -1), "Last month");
    case "last_3":
      return mk(addMonths(cur, -2), cur, "Last 3 months");
    case "last_6":
      return mk(addMonths(cur, -5), cur, "Last 6 months");
    case "last_12":
      return mk(addMonths(cur, -11), cur, "Last 12 months");
    case "ytd":
      return mk(`${now.getFullYear()}-01`, cur, "Year to date");
    case "custom":
      return mk(custom?.from || cur, custom?.to || cur, "Custom");
  }
}

export const monthLabel = (month: string, short = false) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", short ? { month: "short" } : { month: "short", year: "numeric" });
};

export const sourceKey = (s: string | null | undefined) => s?.trim() || "Unknown";
const norm = (s: string) => s.trim().toLowerCase();

export interface SpendRow {
  lead_source: string;
  month: string; // YYYY-MM-01
  amount: number;
}

export interface LeadLike {
  id: string;
  lead_source: string | null;
  stage: string;
  created_at: string;
  project_id: string | null;
}

export interface WonMoney {
  /** Current contract value (original + approved change orders + add-ons). */
  revenue: number;
  /** price − direct cost; null when the job has no cost data yet. */
  grossProfit: number | null;
  /** gross − overhead through planned labor; null without overhead. */
  loadedProfit: number | null;
}

export interface RoiRow {
  source: string;
  paid: boolean;
  spend: number | null;
  leads: number;
  won: number;
  lost: number;
  open: number;
  winRate: number | null;
  costPerLead: number | null;
  costPerWon: number | null;
  openValue: number;
  wonRevenue: number;
  roas: number | null;
  grossProfit: number | null;
  loadedProfit: number | null;
  profitPerDollar: number | null;
  /** Won jobs whose profit is unknown (no cost data) — left out of profit. */
  unknownProfit: number;
  leadIds: string[];
}

const div = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);

export function buildRoiRows(input: {
  leads: LeadLike[];
  spend: SpendRow[];
  /** lead_sources: name → paid. */
  sources: { name: string; paid: boolean }[];
  period: Pick<Period, "from" | "to">;
  openValue: (projectId: string) => number;
  wonMoney: (projectId: string) => WonMoney | null;
  /** Whether fully loaded profit is available at all (overhead set up). */
  hasOverhead: boolean;
}): { rows: RoiRow[]; totals: RoiRow; stillOpen: number } {
  const inPeriod = (month: string) => month >= input.period.from && month <= input.period.to;
  const paidByName = new Map(input.sources.map((s) => [norm(s.name), s.paid]));
  const spendBy = new Map<string, number>();
  for (const s of input.spend) {
    if (!inPeriod(s.month.slice(0, 7))) continue;
    const k = norm(s.lead_source);
    spendBy.set(k, (spendBy.get(k) ?? 0) + Number(s.amount));
  }

  const blank = (source: string): RoiRow => ({
    source,
    paid: false,
    spend: null,
    leads: 0,
    won: 0,
    lost: 0,
    open: 0,
    winRate: null,
    costPerLead: null,
    costPerWon: null,
    openValue: 0,
    wonRevenue: 0,
    roas: null,
    grossProfit: null,
    loadedProfit: null,
    profitPerDollar: null,
    unknownProfit: 0,
    leadIds: [],
  });
  const rows = new Map<string, RoiRow>();
  const rowFor = (name: string) => {
    const k = norm(name);
    let r = rows.get(k);
    if (!r) rows.set(k, (r = blank(name)));
    return r;
  };

  for (const l of input.leads) {
    if (!inPeriod(monthOfIso(l.created_at))) continue;
    const r = rowFor(sourceKey(l.lead_source));
    r.leads++;
    r.leadIds.push(l.id);
    if (l.stage === "won") {
      r.won++;
      const m = l.project_id ? input.wonMoney(l.project_id) : null;
      if (m) {
        r.wonRevenue += m.revenue;
        if (m.grossProfit == null) r.unknownProfit++;
        else {
          r.grossProfit = (r.grossProfit ?? 0) + m.grossProfit;
          if (input.hasOverhead) r.loadedProfit = (r.loadedProfit ?? 0) + (m.loadedProfit ?? m.grossProfit);
        }
      }
    } else if (l.stage === "lost") r.lost++;
    else {
      r.open++;
      if (l.project_id) r.openValue += input.openValue(l.project_id);
    }
  }
  // A paid source with spend but no leads still gets a row (that's the point).
  for (const [k, amt] of spendBy) if (amt > 0 && !rows.has(k)) rowFor(input.sources.find((s) => norm(s.name) === k)?.name ?? k);

  const finish = (r: RoiRow, spendTotal: number | null) => {
    const decided = r.won + r.lost;
    r.winRate = decided > 0 ? (r.won / decided) * 100 : null;
    r.spend = spendTotal;
    // No spend entered yet → "—", not "$0 per lead" (reads as free).
    const spent = r.spend != null && r.spend > 0 ? r.spend : null;
    r.costPerLead = div(spent, r.leads);
    r.costPerWon = div(spent, r.won);
    r.roas = div(r.wonRevenue, r.spend);
    r.profitPerDollar = div(r.grossProfit ?? (r.won > 0 ? null : 0), r.spend);
    return r;
  };

  const out = [...rows.entries()].map(([k, r]) => {
    const listed = paidByName.get(k);
    const hasSpend = (spendBy.get(k) ?? 0) > 0;
    // Paid if the list says so; a source not in the list counts as paid only
    // when someone entered spend for it.
    r.paid = listed ?? hasSpend;
    return finish(r, r.paid ? (spendBy.get(k) ?? 0) : null);
  });

  const totals = blank("All sources");
  totals.paid = true;
  for (const r of out) {
    totals.leads += r.leads;
    totals.won += r.won;
    totals.lost += r.lost;
    totals.open += r.open;
    totals.openValue += r.openValue;
    totals.wonRevenue += r.wonRevenue;
    totals.unknownProfit += r.unknownProfit;
    if (r.grossProfit != null) totals.grossProfit = (totals.grossProfit ?? 0) + r.grossProfit;
    if (r.loadedProfit != null) totals.loadedProfit = (totals.loadedProfit ?? 0) + r.loadedProfit;
  }
  // Blended: all spend over every lead / won job / dollar of won revenue.
  const totalSpend = out.reduce((s, r) => s + (r.spend ?? 0), 0);
  finish(totals, totalSpend);
  return { rows: out, totals, stillOpen: totals.open };
}

export type RoiTone = "green" | "amber" | "red";
export const ROI_TONE_CLASS: Record<RoiTone, string> = {
  green: "text-success",
  amber: "text-warning-strong",
  red: "text-destructive",
};

export interface RoiThresholds {
  roas_good: number;
  roas_min: number;
  profit_good: number;
  profit_min: number;
}
export const DEFAULT_THRESHOLDS: RoiThresholds = { roas_good: 5, roas_min: 2, profit_good: 2, profit_min: 1 };

export function roiTone(value: number | null, good: number, min: number): RoiTone | null {
  if (value == null) return null;
  return value >= good ? "green" : value >= min ? "amber" : "red";
}

export const fmtMultiple = (v: number | null) => (v == null ? "—" : `${v >= 100 ? Math.round(v) : v.toFixed(1)}×`);

/** Cost per lead per month per paid source — the trend line. */
export function cplTrend(leads: LeadLike[], spend: SpendRow[], months: string[], sources: string[]) {
  return months.map((m) => {
    const point: Record<string, string | number | null> = { month: m };
    for (const s of sources) {
      const n = leads.filter((l) => monthOfIso(l.created_at) === m && norm(sourceKey(l.lead_source)) === norm(s)).length;
      const amt = spend.filter((x) => x.month.slice(0, 7) === m && norm(x.lead_source) === norm(s)).reduce((a, x) => a + Number(x.amount), 0);
      point[s] = n > 0 && amt > 0 ? Math.round(amt / n) : null;
    }
    return point;
  });
}

/** "Your ad spend this year differs from Marketing in overhead" — only when
 * it's off by both 25% and $500. Never changes overhead. */
export function overheadMismatch(spendThisYear: number, overheadMarketingAnnual: number | null): boolean {
  if (overheadMarketingAnnual == null || spendThisYear <= 0) return false;
  const diff = Math.abs(spendThisYear - overheadMarketingAnnual);
  return diff >= 500 && diff >= 0.25 * Math.max(spendThisYear, overheadMarketingAnnual);
}
