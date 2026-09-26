import { countsTowardTotals } from "./features";
import { sectionLaborCost, sectionLaborHours, type CostSection } from "./costPlanMath";

/**
 * Overhead / true cost (0110) — the one place the math lives. Pure, so the
 * settings page, Cost plan, quote builder, section chips and project actuals
 * can never disagree.
 *
 *   annual overhead   Σ rows (monthly × 12)
 *   productive hours  field workers × weeks × days/week × hours/day ×
 *                     utilization — or a man-hours / crew-days figure typed in
 *   crew-day          crew size × hours/day man-hours
 *   burden / hour     annual overhead ÷ productive man-hours
 *   job overhead      planned man-hours (every Cost plan labor block) × burden
 *   break-even        direct cost + overhead
 *   expected profit   price − direct            (margin on price)
 *   fully loaded      price − direct − overhead (margin on price)
 *   required price    break-even ÷ (1 − target margin)
 *
 * Overhead is only ever applied through planned labor — never typed into a
 * quote or a Cost plan line.
 */

export type OverheadPeriod = "month" | "year";

export interface OverheadItem {
  key: string;
  label: string;
  amount: number | null;
  period: OverheadPeriod;
}

export type LaborDisplayUnit = "hours" | "crew_days";

export interface OverheadSettings {
  items: OverheadItem[];
  field_workers: number | null;
  weeks_per_year: number | null;
  days_per_week: number | null;
  hours_per_day: number | null;
  utilization_pct: number | null;
  crew_size: number;
  manual_man_hours: number | null;
  manual_crew_days: number | null;
  display_unit: LaborDisplayUnit;
  target_margin_pct: number | null;
}

export const DEFAULT_OVERHEAD_ITEMS: OverheadItem[] = [
  { key: "insurance", label: "Insurance", amount: null, period: "year" },
  { key: "rent", label: "Rent / shop", amount: null, period: "month" },
  { key: "software", label: "Software", amount: null, period: "month" },
  { key: "vehicles", label: "Vehicles", amount: null, period: "month" },
  { key: "admin", label: "Admin / office", amount: null, period: "month" },
  { key: "marketing", label: "Marketing", amount: null, period: "month" },
  { key: "utilities", label: "Utilities", amount: null, period: "month" },
  { key: "other", label: "Other", amount: null, period: "year" },
];

export const OVERHEAD_SETTINGS_DEFAULTS: OverheadSettings = {
  items: DEFAULT_OVERHEAD_ITEMS,
  field_workers: null,
  weeks_per_year: 48,
  days_per_week: 5,
  hours_per_day: 8,
  utilization_pct: 75,
  crew_size: 3,
  manual_man_hours: null,
  manual_crew_days: null,
  display_unit: "hours",
  target_margin_pct: null,
};

const pos = (v: number | null | undefined): number | null => (v != null && isFinite(v) && v > 0 ? v : null);

export const annualAmount = (item: Pick<OverheadItem, "amount" | "period">) =>
  (pos(item.amount) ?? 0) * (item.period === "month" ? 12 : 1);

export const annualOverhead = (s: Pick<OverheadSettings, "items">) => s.items.reduce((sum, i) => sum + annualAmount(i), 0);

/** Man-hours in one crew-day: crew size × hours/day (8 if not set). */
export const crewDayHours = (s: Pick<OverheadSettings, "crew_size" | "hours_per_day">) =>
  (pos(s.crew_size) ?? 3) * (pos(s.hours_per_day) ?? 8);

/** From the helper, when every input is filled in. */
export function helperManHours(
  s: Pick<OverheadSettings, "field_workers" | "weeks_per_year" | "days_per_week" | "hours_per_day" | "utilization_pct">,
): number | null {
  const w = pos(s.field_workers), wk = pos(s.weeks_per_year), d = pos(s.days_per_week), h = pos(s.hours_per_day), u = pos(s.utilization_pct);
  return w && wk && d && h && u ? w * wk * d * h * (Math.min(u, 100) / 100) : null;
}

/** Productive man-hours / year: a figure typed in (man-hours, else
 * crew-days × crew-day hours) wins over the helper. */
export function productiveManHours(s: OverheadSettings): number | null {
  const manual = pos(s.manual_man_hours);
  if (manual) return manual;
  const crewDays = pos(s.manual_crew_days);
  if (crewDays) return crewDays * crewDayHours(s);
  return helperManHours(s);
}

export const productiveCrewDays = (s: OverheadSettings) => {
  const h = productiveManHours(s);
  return h == null ? null : h / crewDayHours(s);
};

/** $ of overhead per productive man-hour — null until both overhead and
 * capacity are set up. */
export function burdenPerHour(s: OverheadSettings | null | undefined): number | null {
  if (!s) return null;
  const annual = annualOverhead(s);
  const hours = productiveManHours(s);
  return annual > 0 && hours ? annual / hours : null;
}

export const burdenPerCrewDay = (s: OverheadSettings | null | undefined) => {
  const b = burdenPerHour(s);
  return b == null || !s ? null : b * crewDayHours(s);
};

// ---------------------------------------------------------------------------
// Planned labor → overhead
// ---------------------------------------------------------------------------

/** Planned man-hours across sections that count (proposed / removed
 * features left out), General included. */
export const plannedManHours = (sections: CostSection[], opts: { all?: boolean } = {}) =>
  (opts.all ? sections : sections.filter(countsTowardTotals)).reduce((s, sec) => s + sectionLaborHours(sec), 0);

/** Lump-sum labor blocks with no man-hours — they can't carry overhead. */
export const lumpSumsWithoutHours = (sections: CostSection[]) =>
  sections.filter(countsTowardTotals).filter((s) => s.labor_mode === "lump_sum" && Number(s.labor_lump_sum) > 0 && sectionLaborHours(s) <= 0).length;

/** The average planned labor cost per man-hour (for the required selling rate). */
export function averageLaborRate(sections: CostSection[]): number | null {
  const counted = sections.filter(countsTowardTotals).filter((s) => sectionLaborHours(s) > 0);
  const hours = counted.reduce((t, s) => t + sectionLaborHours(s), 0);
  const cost = counted.reduce((t, s) => t + sectionLaborCost(s), 0);
  return hours > 0 ? cost / hours : null;
}

export type TrueCostStatus = "green" | "amber" | "red";

/** Text color for a fully loaded profit: green at / above target, amber
 * between break-even and target, red below break-even. */
export const TRUE_COST_STATUS_CLASS: Record<TrueCostStatus, string> = {
  green: "text-success",
  amber: "text-warning-strong",
  red: "text-destructive",
};

export interface TrueCost {
  direct: number;
  manHours: number;
  overhead: number;
  breakEven: number;
  price: number;
  expectedProfit: number;
  expectedMarginPct: number | null;
  fullyLoadedProfit: number;
  fullyLoadedMarginPct: number | null;
  targetMarginPct: number | null;
  /** Price that hits the target margin after overhead — null without a target. */
  requiredPrice: number | null;
  /** price − required price (+ above, − below). */
  requiredGap: number | null;
  /** green: at / above target · amber: profitable, under target · red: below break-even. */
  status: TrueCostStatus;
}

export function trueCost(input: {
  direct: number;
  manHours: number;
  rate: number;
  price: number;
  targetMarginPct: number | null;
}): TrueCost {
  const overhead = input.manHours * input.rate;
  const breakEven = input.direct + overhead;
  const price = input.price;
  const expectedProfit = price - input.direct;
  const fullyLoadedProfit = price - breakEven;
  const pct = (v: number) => (price > 0 ? (v / price) * 100 : null);
  const t = input.targetMarginPct != null && input.targetMarginPct > 0 && input.targetMarginPct < 100 ? input.targetMarginPct : null;
  const requiredPrice = t != null ? breakEven / (1 - t / 100) : null;
  const fullyLoadedMarginPct = pct(fullyLoadedProfit);
  const status: TrueCostStatus =
    fullyLoadedProfit < 0 ? "red" : t != null && (fullyLoadedMarginPct ?? 0) < t ? "amber" : "green";
  return {
    direct: input.direct,
    manHours: input.manHours,
    overhead,
    breakEven,
    price,
    expectedProfit,
    expectedMarginPct: pct(expectedProfit),
    fullyLoadedProfit,
    fullyLoadedMarginPct,
    targetMarginPct: t,
    requiredPrice,
    requiredGap: requiredPrice != null ? price - requiredPrice : null,
    status,
  };
}

/** What labor has to sell for per man-hour to cover its cost, overhead and
 * the target margin: (labor cost/hr + burden) ÷ (1 − target). */
export function requiredSellRatePerHour(laborRate: number | null, burden: number, targetMarginPct: number | null): number | null {
  if (laborRate == null) return null;
  const t = targetMarginPct != null && targetMarginPct > 0 && targetMarginPct < 100 ? targetMarginPct : 0;
  return (laborRate + burden) / (1 - t / 100);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const fmtNum = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 1 });

/** "56 man-hours" or "2.3 crew-days", per the contractor's preference. */
export function formatLabor(manHours: number, s: Pick<OverheadSettings, "display_unit" | "crew_size" | "hours_per_day"> | null | undefined): string {
  if (s?.display_unit === "crew_days") {
    const d = manHours / crewDayHours(s);
    return `${fmtNum(d)} crew-day${d === 1 ? "" : "s"}`;
  }
  return `${fmtNum(manHours)} man-hour${manHours === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// "This looks like overhead" on a Cost plan line
// ---------------------------------------------------------------------------

const OVERHEAD_WORDS =
  /\b(insurance|liability|workers'? ?comp|truck payment|vehicle payment|car payment|lease payment|loan payment|software|subscription|saas|crm|office|rent|shop rent|yard rent|marketing|advertis\w*|website|seo|phone bill|cell ?phone|accounting|bookkeep\w*|payroll service|admin\w*|utilit\w*|electric bill|internet|fuel card)\b/i;
const JOB_WORDS = /\b(permit|dumpster|rental|rent(ed)? (a|the)?\s*(skid|excavator|compactor|machine|equipment|lift)|delivery|disposal|haul\w*|equipment|machine|excavator|skid|compactor|porta|toilet|inspection)\b/i;

/** A Cost plan line that reads like a company-wide overhead cost (already
 * covered by the overhead rate). Job-specific costs never match. */
export function looksLikeOverhead(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  if (JOB_WORDS.test(n)) return false;
  return OVERHEAD_WORDS.test(n);
}
