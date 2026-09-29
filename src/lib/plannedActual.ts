import type { Category, ChangeOrder, Expense, ExpenseCategory, LaborEntry, MaterialsItem, MaterialsUsageLog, Quote } from "./api";
import { quoteTotal } from "./api";
import {
  COST_BUCKETS,
  COST_TYPE_LABEL,
  costTypeOf,
  lineCost,
  sectionLaborCost,
  sectionLaborHours,
  type CostBucket,
  type CostSection,
} from "./costPlanMath";
import { expenseBucket } from "./costPlan";
import { activeFeatures, countsTowardTotals, featureName, type ProjectFeature } from "./features";
import { featurePrice } from "./featureFinancials";
import {
  deliveredQuantity,
  effectiveEstimate,
  lineActualCost,
  usedQuantity,
  type DeliveryLineWithOrderStatus,
} from "./materialTracking";

/**
 * Planned vs actual (Feature 5) — the one place this math lives. Pure, over
 * already-fetched rows, so the project page card, the Cost plan and the
 * closeout snapshot can't disagree.
 *
 *   planned   the Cost plan: each feature's lines by cost type + labor blocks
 *   actual    expenses tagged to the feature (by cost type), labor entries,
 *             and delivered material cost — the latter only once the job is
 *             Complete and every line is reconciled (the same gate as the
 *             Profit summary, so the two never disagree)
 *   variance  actual − planned; % of planned; colored by the thresholds in
 *             Settings (green ≤ amber%, amber ≤ red%, red beyond)
 *
 * Labor is compared where it's actually tracked: per feature when (nearly)
 * all logged hours are tagged with a feature, otherwise project-wide, with
 * any per-feature split flagged "Estimated split (by planned share)".
 */

export type VarianceTone = "green" | "amber" | "red" | "none";

export interface VarianceThresholds {
  /** Over plan by up to this % still reads green. */
  amberPct: number;
  /** Over plan by more than this % reads red. */
  redPct: number;
}

export const DEFAULT_VARIANCE_THRESHOLDS: VarianceThresholds = { amberPct: 0, redPct: 10 };

export const VARIANCE_TONE_CLASS: Record<VarianceTone, string> = {
  green: "text-success",
  amber: "text-warning-strong",
  red: "text-destructive",
  none: "text-muted-foreground",
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function variance(planned: number, actual: number) {
  const dollars = r2(actual - planned);
  const pct = planned > 0 ? (dollars / planned) * 100 : null;
  return { dollars, pct };
}

export function varianceTone(planned: number, actual: number, t: VarianceThresholds = DEFAULT_VARIANCE_THRESHOLDS): VarianceTone {
  if (planned <= 0 && actual <= 0) return "none";
  if (planned <= 0) return actual > 0 ? "red" : "none";
  const pct = ((actual - planned) / planned) * 100;
  if (pct <= t.amberPct) return "green";
  if (pct <= t.redPct) return "amber";
  return "red";
}

/** "+$450" / "−$1,350" */
export const signedMoney = (v: number) =>
  `${v < 0 ? "−" : "+"}${Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`;

export interface VarianceCell {
  planned: number;
  actual: number;
  dollars: number;
  pct: number | null;
  tone: VarianceTone;
}

const cell = (planned: number, actual: number, t: VarianceThresholds): VarianceCell => ({
  planned: r2(planned),
  actual: r2(actual),
  ...variance(planned, actual),
  tone: varianceTone(planned, actual, t),
});

export interface LineRow {
  id: string;
  name: string;
  unit: string | null;
  plannedQty: number;
  /** Used when usage was logged, else delivered. */
  actualQty: number;
  qtySource: "used" | "delivered" | "none";
  qty: VarianceCell;
  /** Delivered cost (always shown per line; counts in the bucket totals
   * only once materials are counted — see module doc). */
  cost: VarianceCell;
}

export interface BucketRow extends VarianceCell {
  bucket: CostBucket;
  label: string;
  /** Labor split across features by planned share, not logged per feature. */
  estimatedSplit?: boolean;
  /** Job still open (not Complete + reconciled) and spend on this type is
   * below plan: carried at planned cost, variance 0 — never read as "$X
   * under plan" before the costs are all in. */
  pending?: boolean;
}

export interface FeatureBlock {
  featureId: string | null;
  name: string;
  categoryId: string | null;
  price: number;
  buckets: BucketRow[];
  total: VarianceCell;
  lines: LineRow[];
  labor: { plannedHours: number; actualHours: number | null; estimatedSplit: boolean };
}

export type LaborTracking = "per_feature" | "project" | "none";

export interface ProfitBridgeStep {
  label: string;
  /** Effect on profit (negative = cost overrun). */
  amount: number;
}

export interface PlannedActualReport {
  features: FeatureBlock[];
  project: { buckets: BucketRow[]; total: VarianceCell; price: number; plannedHours: number; actualHours: number };
  laborTracking: LaborTracking;
  materialsCounted: boolean;
  hasActuals: boolean;
  profit: {
    expected: number;
    actual: number;
    /** Fully loaded (Feature 1) when an overhead rate is known. */
    expectedFullyLoaded: number | null;
    actualFullyLoaded: number | null;
    overheadRate: number | null;
    /** Largest drivers first; they add up to actual − expected. */
    bridge: ProfitBridgeStep[];
  };
  /** Over-plan items, biggest $ first. */
  biggest: { key: string; label: string; where: string; dollars: number; pct: number | null; tone: VarianceTone }[];
}

type Section = Omit<CostSection, "materials_items"> & { feature_id?: string | null; materials_items?: MaterialsItem[] };

export function plannedActualReport(input: {
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  sections: Section[];
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  expenses: Pick<Expense, "amount" | "expense_category_id" | "expense_lines" | "cost_type" | "feature_id">[];
  expenseCategories: Pick<ExpenseCategory, "id" | "cost_type">[];
  laborEntries: Pick<LaborEntry, "cost" | "hours" | "feature_id">[];
  deliveries: DeliveryLineWithOrderStatus[];
  usageLogs: MaterialsUsageLog[];
  /** Delivered material cost counts in the totals (Complete + reconciled). */
  materialsCounted: boolean;
  overheadRate: number | null;
  thresholds?: VarianceThresholds;
}): PlannedActualReport {
  const t = input.thresholds ?? DEFAULT_VARIANCE_THRESHOLDS;
  const live = activeFeatures(input.features);
  const liveIds = new Set(live.map((f) => f.id));
  const keyOf = (id: string | null | undefined) => (id && liveIds.has(id) ? id : null);
  const counted = input.sections.filter(countsTowardTotals);

  // --- Actual by feature × bucket (expenses, material deliveries)
  const actual = new Map<string | null, Record<CostBucket, number>>();
  const bump = (fid: string | null | undefined, b: CostBucket, v: number) => {
    const k = keyOf(fid);
    const row = actual.get(k) ?? { material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 };
    row[b] += v;
    actual.set(k, row);
  };
  for (const e of input.expenses) {
    const lines = e.expense_lines ?? [];
    if (lines.length > 1) {
      for (const l of lines) bump(l.feature_id, l.cost_type ?? expenseBucket(l.expense_category_id, input.expenseCategories), Number(l.amount) || 0);
    } else bump(e.feature_id, e.cost_type ?? expenseBucket(e.expense_category_id, input.expenseCategories), Number(e.amount) || 0);
  }

  // --- Labor: where is it tracked?
  const totalHours = input.laborEntries.reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const totalLaborCost = input.laborEntries.reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const taggedHours = input.laborEntries.filter((l) => keyOf(l.feature_id)).reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const laborTracking: LaborTracking =
    input.laborEntries.length === 0 ? "none" : live.length > 0 && taggedHours >= totalHours * 0.8 ? "per_feature" : "project";

  const plannedHoursOf = (fid: string | null) =>
    counted.filter((s) => keyOf(s.feature_id) === fid).reduce((a, s) => a + sectionLaborHours(s), 0);
  const plannedLaborCostOf = (fid: string | null) =>
    counted.filter((s) => keyOf(s.feature_id) === fid).reduce((a, s) => a + sectionLaborCost(s), 0);
  const projectPlannedHours = counted.reduce((a, s) => a + sectionLaborHours(s), 0);
  const projectPlannedLabor = counted.reduce((a, s) => a + sectionLaborCost(s), 0);

  const laborActual = new Map<string | null, { cost: number; hours: number }>();
  if (laborTracking === "per_feature") {
    for (const l of input.laborEntries) {
      const k = keyOf(l.feature_id);
      const cur = laborActual.get(k) ?? { cost: 0, hours: 0 };
      laborActual.set(k, { cost: cur.cost + (Number(l.cost) || 0), hours: cur.hours + (Number(l.hours) || 0) });
    }
  } else if (laborTracking === "project") {
    // Estimated split by planned share (labor cost share; hours share when
    // no planned labor cost).
    const keys: (string | null)[] = [...live.map((f) => f.id), null];
    const base = projectPlannedLabor > 0 ? projectPlannedLabor : projectPlannedHours;
    for (const k of keys) {
      const share = base > 0 ? (projectPlannedLabor > 0 ? plannedLaborCostOf(k) : plannedHoursOf(k)) / base : k === null ? 1 : 0;
      laborActual.set(k, { cost: totalLaborCost * share, hours: totalHours * share });
    }
  }

  // --- Material lines
  const lineRows = (fid: string | null): LineRow[] =>
    counted
      .filter((s) => keyOf(s.feature_id) === fid)
      .flatMap((s) => (s.materials_items ?? []) as MaterialsItem[])
      .filter((l) => costTypeOf(l) === "material")
      .map((l) => {
        const est = effectiveEstimate(l);
        const used = usedQuantity(l, input.usageLogs);
        const delivered = deliveredQuantity(l, input.deliveries);
        const actualQty = used > 0 ? used : delivered;
        const qtySource: LineRow["qtySource"] = used > 0 ? "used" : delivered > 0 ? "delivered" : "none";
        const plannedCost = est.quantity * est.unit_cost;
        const actualCost = lineActualCost(l, input.deliveries);
        return {
          id: l.id,
          name: l.name,
          unit: est.unit ?? l.unit ?? null,
          plannedQty: r2(est.quantity),
          actualQty: r2(actualQty),
          qtySource,
          qty: cell(est.quantity, actualQty, t),
          cost: cell(plannedCost, actualCost, t),
        };
      });

  const priceOf = (fid: string | null) => {
    if (fid) return featurePrice(fid, input.quotes, input.changeOrders);
    const all =
      input.quotes.filter((q) => q.status === "approved").reduce((s, q) => s + quoteTotal(q.quote_sections), 0) +
      input.changeOrders
        .filter((co) => co.status === "approved")
        .reduce(
          (s, co) =>
            s +
            (co.change_order_sections ?? []).reduce(
              (a, sec) => a + (sec.change_order_items ?? []).reduce((b, i) => b + Number(i.price) * (i.quantity == null ? 1 : Number(i.quantity)), 0),
              0,
            ),
          0,
        );
    return all - live.reduce((s, f) => s + featurePrice(f.id, input.quotes, input.changeOrders), 0);
  };

  const block = (fid: string | null, name: string, categoryId: string | null): FeatureBlock => {
    const secs = counted.filter((s) => keyOf(s.feature_id) === fid);
    const planned: Record<CostBucket, number> = { material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 };
    for (const s of secs) {
      for (const l of s.materials_items ?? []) planned[costTypeOf(l)] += lineCost(l);
      planned.labor += sectionLaborCost(s);
    }
    const act = { ...(actual.get(fid) ?? { material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 }) };
    const lines = lineRows(fid);
    if (input.materialsCounted) act.material += lines.reduce((s, l) => s + l.cost.actual, 0);
    const lab = laborActual.get(fid);
    act.labor += lab?.cost ?? 0;
    // Job still open (not Complete + reconciled): each type counts as what's
    // been spent, or its plan if that's more — spend isn't all in yet, so an
    // unspent plan never reads as "$X under plan / +$X profit", while an
    // overrun shows as soon as it happens.
    const carried = new Set<CostBucket>();
    if (!input.materialsCounted) {
      for (const b of COST_BUCKETS) {
        if (planned[b] > 0 && act[b] < planned[b]) {
          act[b] = planned[b];
          carried.add(b);
        }
      }
    }
    const buckets = COST_BUCKETS.map((b) => {
      const c = cell(planned[b], act[b], t);
      return {
        bucket: b,
        label: COST_TYPE_LABEL[b],
        ...c,
        ...(carried.has(b) ? { tone: "none" as const, pending: true } : {}),
        estimatedSplit: b === "labor" && laborTracking === "project" && live.length > 0 ? true : undefined,
      };
    }).filter((b) => b.planned > 0 || b.actual > 0);
    const pT = COST_BUCKETS.reduce((s, b) => s + planned[b], 0);
    const aT = COST_BUCKETS.reduce((s, b) => s + act[b], 0);
    return {
      featureId: fid,
      name,
      categoryId,
      price: r2(priceOf(fid)),
      buckets,
      total: cell(pT, aT, t),
      lines,
      labor: {
        plannedHours: r2(plannedHoursOf(fid)),
        actualHours: lab ? r2(lab.hours) : laborTracking === "none" ? null : 0,
        estimatedSplit: laborTracking === "project" && live.length > 0,
      },
    };
  };

  const features = [
    ...live.map((f) => block(f.id, featureName(f, input.categories), f.category_id)),
    block(null, live.length ? "General" : "Whole project", null),
  ].filter((f) => f.featureId !== null || f.total.planned > 0 || f.total.actual > 0 || live.length === 0);

  // --- Project totals
  const projectBuckets = COST_BUCKETS.map((b) => {
    const planned = features.reduce((s, f) => s + (f.buckets.find((x) => x.bucket === b)?.planned ?? 0), 0);
    const act = features.reduce((s, f) => s + (f.buckets.find((x) => x.bucket === b)?.actual ?? 0), 0);
    const rows = features.map((f) => f.buckets.find((x) => x.bucket === b)).filter(Boolean) as BucketRow[];
    const pending = rows.length > 0 && rows.every((r) => r.pending);
    return { bucket: b, label: COST_TYPE_LABEL[b], ...cell(planned, act, t), ...(pending ? { tone: "none" as const, pending: true } : {}) };
  }).filter((b) => b.planned > 0 || b.actual > 0);
  const pTotal = projectBuckets.reduce((s, b) => s + b.planned, 0);
  const aTotal = projectBuckets.reduce((s, b) => s + b.actual, 0);
  const price = features.reduce((s, f) => s + f.price, 0);

  // --- Profit bridge: what moved profit (line-level for materials when
  // counted, bucket-level otherwise; labor project-wide when that's where
  // it's tracked).
  const drivers: ProfitBridgeStep[] = [];
  const multi = live.length > 0;
  for (const f of features) {
    const where = multi ? ` (${f.name})` : "";
    for (const b of f.buckets) {
      if (b.bucket === "labor" && laborTracking === "project") continue;
      if (b.bucket === "material" && input.materialsCounted) {
        let lineSum = 0;
        for (const l of f.lines) {
          if (Math.abs(l.cost.dollars) >= 1) drivers.push({ label: `${l.name}${where}`, amount: -l.cost.dollars });
          lineSum += l.cost.dollars;
        }
        const rest = b.dollars - lineSum;
        if (Math.abs(rest) >= 1) drivers.push({ label: `Other materials${where}`, amount: -rest });
        continue;
      }
      if (Math.abs(b.dollars) >= 1) drivers.push({ label: `${b.label}${where}`, amount: -b.dollars });
    }
  }
  if (laborTracking === "project") {
    const lb = projectBuckets.find((b) => b.bucket === "labor");
    if (lb && Math.abs(lb.dollars) >= 1) drivers.push({ label: "Labor", amount: -lb.dollars });
  }
  drivers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const TOP = 6;
  const bridge = drivers.slice(0, TOP);
  const restAmt = drivers.slice(TOP).reduce((s, d) => s + d.amount, 0);
  if (Math.abs(restAmt) >= 1) bridge.push({ label: "Everything else", amount: r2(restAmt) });

  const expected = r2(price - pTotal);
  const actualProfit = r2(price - aTotal);
  const rate = input.overheadRate;
  const expectedFL = rate != null ? r2(expected - projectPlannedHours * rate) : null;
  // Overhead rides on hours, so it follows the same open-job rule as the cost
  // types: hours logged or planned, whichever is more — unlogged hours never
  // read as "+$X overhead saved".
  const overheadHours = input.materialsCounted ? totalHours : Math.max(totalHours, projectPlannedHours);
  const actualFL = rate != null ? r2(actualProfit - overheadHours * rate) : null;
  if (rate != null && Math.abs((overheadHours - projectPlannedHours) * rate) >= 1) {
    bridge.push({ label: `Overhead on ${overheadHours >= projectPlannedHours ? "extra" : "fewer"} hours`, amount: r2(-(overheadHours - projectPlannedHours) * rate) });
  }

  // --- Biggest over-plan items
  const biggest: PlannedActualReport["biggest"] = [];
  for (const f of features) {
    for (const b of f.buckets) {
      if (b.bucket === "material" && input.materialsCounted) continue; // lines below instead
      if (b.bucket === "labor" && laborTracking === "project") continue;
      if (b.dollars > 0) biggest.push({ key: `${f.featureId}-${b.bucket}`, label: b.label, where: f.name, dollars: b.dollars, pct: b.pct, tone: b.tone });
    }
    for (const l of f.lines) {
      if (input.materialsCounted ? l.cost.dollars > 0 : l.qty.dollars > 0 && l.qtySource !== "none") {
        biggest.push({
          key: `line-${l.id}`,
          label: l.name,
          where: f.name,
          dollars: input.materialsCounted ? l.cost.dollars : r2((l.actualQty - l.plannedQty) * (l.plannedQty > 0 ? l.cost.planned / l.plannedQty : 0)),
          pct: l.qty.pct,
          tone: l.qty.tone,
        });
      }
    }
  }
  if (laborTracking === "project") {
    const lb = projectBuckets.find((b) => b.bucket === "labor");
    if (lb && lb.dollars > 0) biggest.push({ key: "labor", label: "Labor", where: "Whole project", dollars: lb.dollars, pct: lb.pct, tone: lb.tone });
  }
  biggest.sort((a, b) => b.dollars - a.dollars);

  return {
    features,
    project: { buckets: projectBuckets, total: cell(pTotal, aTotal, t), price: r2(price), plannedHours: r2(projectPlannedHours), actualHours: r2(totalHours) },
    laborTracking,
    materialsCounted: input.materialsCounted,
    hasActuals: aTotal > 0 || input.deliveries.length > 0 || input.usageLogs.length > 0,
    profit: { expected, actual: actualProfit, expectedFullyLoaded: expectedFL, actualFullyLoaded: actualFL, overheadRate: rate, bridge },
    biggest: biggest.filter((b) => b.dollars >= 1).slice(0, 5),
  };
}

/** "Gravel +$450, Labor +$900 → Profit −$1,350" */
export function profitSentence(r: PlannedActualReport): string | null {
  const loaded = r.profit.actualFullyLoaded != null && r.profit.expectedFullyLoaded != null;
  const over = r.profit.bridge.filter((s) => s.amount < 0 && (loaded || !s.label.startsWith("Overhead"))).slice(0, 3);
  const delta = loaded ? r.profit.actualFullyLoaded! - r.profit.expectedFullyLoaded! : r.profit.actual - r.profit.expected;
  if (!over.length || Math.abs(delta) < 1) return null;
  return `${over.map((s) => `${s.label} ${signedMoney(-s.amount)}`).join(", ")} → ${loaded ? "Fully loaded profit" : "Profit"} ${signedMoney(delta)}`;
}
